const fs = require('fs');
const path = require('path');
const { getActiveDeployments, updateDeploymentContainer } = require('./database');
const { updateNginxConfig } = require('./nginx');
const logger = require('./logger');
const { execCommand } = require('../utils/docker');
const { pool } = require('../config/database');
const nextConfig = require('./nextConfig');
const APPS_DIR = process.env.HOST_APPS_DIR || '/app/apps';

const networkName = 'port-au-next_port_au_next_network';

async function getAppEnvVars(appName, branch = 'main', filterPrefix = null) {
  const query = `
    SELECT key, value 
    FROM app_env_vars av
    JOIN apps a ON a.id = av.app_id
    WHERE a.name = $1 AND av.branch = $2
    ${filterPrefix ? `AND key LIKE '${filterPrefix}%'` : ''}
  `;

  const envResult = await pool.query(query, [appName, branch]);
  return envResult.rows;
}

async function ensureDockerfile(appDir, appName) {
  const dockerfilePath = path.join(appDir, 'Dockerfile');
  
  if (!fs.existsSync(dockerfilePath)) {
    await logger.info('No Dockerfile found, creating one...');

    const dockerfile = `
FROM node:20-alpine3.20 AS base

# 1. Install dependencies only when needed
FROM base as deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy env file for build time
RUN npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
`;
    fs.writeFileSync(dockerfilePath, dockerfile);
    await logger.info('Created default Dockerfile');
  } else {
    await logger.debug('Using existing Dockerfile');
  }
}

async function buildImage(appName, version) {
  try {
    const imageTag = `${appName}:${version}`;
    const appDir = path.join(APPS_DIR, appName);
    const logFile = `./log-build-${appName}.log`;
    
    await logger.info('Building Docker image', { imageTag });
    await execCommand(`docker build -t ${imageTag} ${appDir} &> ${logFile}`);
    
    await logger.info('Docker image built successfully', { imageTag });

    // Read log file and log the output
    const logContent = fs.readFileSync(logFile, 'utf8');
    await logger.info('Docker build log', { logContent });

    return imageTag;
  } catch (error) {
    await logger.error(`Error building image`, error);
    throw error;
  }
}

async function startContainer(containerName, imageTag, networkName, envString) {
  await logger.info('Starting container', { containerName });
  
  await execCommand(
    `docker run -d --restart unless-stopped --name ${containerName} --network ${networkName} ${envString} ${imageTag}`
  );
  
  const containerId = await execCommand(
    `docker inspect --format='{{.Id}}' ${containerName}`
  );

  await logger.info('Container started successfully', { 
    containerId: containerId.trim(),
    containerName 
  });

  return {
    containerId: containerId.trim(),
    containerName
  };
}

async function buildAndStartContainer(appName, version, env = {}) {
  try {
    const appDir = path.join(APPS_DIR, appName);
    await ensureDockerfile(appDir, appName);

    await nextConfig.modifyNextConfig(appDir, appName);

    await logger.debug('Fetching environment variables');
    const envVars = await getAppEnvVars(appName, env.BRANCH || 'main');

    const appEnv = {
      ...env,
      ...Object.fromEntries(envVars.map(row => [row.key, row.value]))
    };

    const envFilePath = path.join(appDir, '.env');
    const envFileContent = Object.entries(appEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(envFilePath, envFileContent, { encoding: 'utf-8' });
    await logger.info('Created .env file', { path: envFilePath });

    const imageTag = await buildImage(appName, version);
    const timestamp = new Date().getTime();
    const containerName = `${appName}_${version}_${timestamp}`;

    const envString = Object.entries(appEnv)
      .map(([key, value]) => `"-e ${key}=${value}"`)
      .join(' ');

    return await startContainer(containerName, imageTag, networkName, envString);
  } catch (error) {
    await logger.error(`Error building and starting container`, error);
    throw error;
  }
}

async function stopContainer(containerId) {
  try {
    try {
      await logger.info('Disconnecting container from network', { containerId });
      await execCommand(`docker network disconnect ${networkName} ${containerId}`);
    } catch (e) {
      await logger.warning('Container might already be disconnected from network', { error: e.message });
    }

    await logger.info('Stopping container', { containerId });
    await execCommand(`docker stop ${containerId}`);
    
    await logger.info('Removing container', { containerId });
    await execCommand(`docker rm ${containerId}`);
    
    await logger.info('Container stopped and removed successfully', { containerId });
  } catch (error) {
    await logger.error(`Error stopping container`, error);
    throw error;
  }
}

async function waitForHealthyContainer(containerId, timeout = 30000) {
  const startTime = Date.now();
  
  await logger.info('Waiting for container to be healthy', { containerId, timeout });
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await execCommand(
        `docker inspect -f '{{.State.Health.Status}}' ${containerId}`
      );
      
      if (status.trim() === 'healthy') {
        await logger.info('Container is healthy', { containerId });
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      await logger.debug('Container health check pending...', { containerId });
    }
  }
  
  const error = new Error('Container health check timeout');
  await logger.error('Container health check failed', error);
  throw error;
}

async function containerExists(containerId) {
  try {
    // Use --no-trunc to get full container IDs in the listing
    const result = await execCommand(`docker ps -a --no-trunc -q -f "id=${containerId}"`);
    return result.trim() !== '';
  } catch (error) {
    logger.debug('Container existence check failed', { 
      error: error.message,
      containerId 
    });
    return false;
  }
}

async function startExistingContainer(containerId) {
  await logger.info('Starting existing container', { containerId });
  
  await execCommand(`docker start ${containerId}`);
  
  await logger.info('Container started successfully', { containerId });
  return { containerId };
}

async function imageExists(imageTag) {
  try {
    const result = await execCommand(`docker image inspect ${imageTag}`);
    return true;
  } catch (error) {
    logger.debug('Image not found', { imageTag });
    return false;
  }
}

async function recoverContainers() {
  try {
    const deployments = await getActiveDeployments();
    await logger.info('Recovering active containers...', { count: deployments.length });

    for (const deployment of deployments) {
      try {
        const exists = await containerExists(deployment.container_id);
        
        if (!exists) {
          const imageTag = `${deployment.name}:${deployment.version}`;
          const hasImage = await imageExists(imageTag);

          if (hasImage) {
            await logger.info(`Container gone but image exists, starting new container`, {
              name: deployment.name,
              imageTag
            });

            // Get environment variables from database
            const envVars = await getAppEnvVars(deployment.name, 'main');
            const envString = envVars
              .map(({ key, value }) => `"-e ${key}=${value}"`)
              .join(' ');

            const timestamp = new Date().getTime();
            const containerName = `${deployment.name}_${deployment.version}_${timestamp}`;

            const { containerId } = await startContainer(
              containerName,
              imageTag,
              networkName,
              envString
            );

            await updateNginxConfig(
              deployment.name,
              deployment.domain,
              containerId
            );

            await updateDeploymentContainer(deployment.container_id, containerId);
            
            await logger.info(`Successfully started new container from existing image`, {
              name: deployment.name,
              containerId
            });
          } else {
            await logger.info(`Container and image gone, performing full rebuild`, {
              name: deployment.name,
              containerId: deployment.container_id
            });
            
            const { containerId } = await buildAndStartContainer(
              deployment.name,
              deployment.version
            );

            await updateNginxConfig(
              deployment.name,
              deployment.domain,
              containerId
            );

            await updateDeploymentContainer(deployment.container_id, containerId);
          }
          continue;
        }

        // If container exists, check its status
        const containerStatus = await execCommand(
          `docker inspect -f '{{.State.Status}}' ${deployment.container_id}`
        ).catch(error => {
          logger.debug('Container status check failed', { 
            error: error.message,
            containerId: deployment.container_id 
          });
          return null;
        });

        if (containerStatus && containerStatus.trim() !== 'running') {
          await logger.info(`Container exists but not running, attempting to recover`, { 
            name: deployment.name, 
            status: containerStatus.trim() 
          });
          
          // Double check after a delay to avoid race conditions with docker restart
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const retryStatus = await execCommand(
            `docker inspect -f '{{.State.Status}}' ${deployment.container_id}`
          ).catch(() => null);

          if (!retryStatus || retryStatus.trim() !== 'running') {
            // Simply start the existing container instead of creating a new one
            await startExistingContainer(deployment.container_id);

            // Container could start with a different IP address, so we need to update the nginx config
            await updateNginxConfig(
              deployment.name,
              deployment.domain,
              deployment.container_id
            );

            await logger.info(`Successfully recovered existing container`, { 
              name: deployment.name,
              containerId: deployment.container_id 
            });
          } else {
            await logger.info(`Container recovered on its own`, { 
              name: deployment.name,
              status: retryStatus.trim() 
            });
          }
        } else {
          await logger.info(`Container is healthy`, { 
            name: deployment.name,
            status: containerStatus ? containerStatus.trim() : 'unknown'
          });
        }
      } catch (error) {
        await logger.error(`Failed to recover container`, { 
          name: deployment.name,
          error: error.message || 'Unknown error'
        });
      }
    }
  } catch (error) {
    await logger.error('Container recovery failed', error);
    throw error;
  }
}

async function deleteAppContainers(appName) {
  try {
    // Find all containers for this app (active and inactive)
    const containers = await execCommand(`docker ps -a --filter "name=${appName}" --format "{{.ID}}"`);
    const containerIds = containers.trim().split('\n').filter(id => id);

    // Stop and remove each container
    for (const containerId of containerIds) {
      await execCommand(`docker stop ${containerId}`);
      await execCommand(`docker rm ${containerId}`);
    }
  } catch (error) {
    await logger.error(`Error deleting containers for ${appName}`, error);
    throw error;
  }
}

module.exports = {
  buildAndStartContainer,
  startContainer,
  stopContainer,
  waitForHealthyContainer,
  recoverContainers,
  containerExists,
  deleteAppContainers
}; 