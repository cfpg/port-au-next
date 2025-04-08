import * as fs from 'fs';
import * as path from 'path';

import { getActiveDeployments, updateDeploymentContainer } from '~/services/database';
import { updateNginxConfig } from '~/services/nginx';
import logger from '~/services/logger';
import pool from '~/services/database';
import { modifyNextConfig } from '~/services/nextConfig';

import { execCommand } from '~/utils/docker';
import getAppsDir from '~/utils/getAppsDir';
import { ServiceStatus } from '~/types';
import { Service } from '~/types';
import { ServiceHealth } from '~/types';
import { setupAppStorage, getMinioEnvVars } from './minio';
import { App } from '~/types';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';

// Types
interface EnvVar {
  key: string;
  value: string;
}

interface ContainerInfo {
  containerId: string;
  containerName?: string;
}

// Constants
const APPS_DIR: string = getAppsDir();
const networkName: string = 'port-au-next_port_au_next_network';


async function getAppEnvVars(app: App, branch: string = 'main', filterPrefix: string | null = null): Promise<EnvVar[]> {
  const query = `
    SELECT key, value 
    FROM app_env_vars av
    JOIN apps a ON a.id = av.app_id
    WHERE a.id = $1 AND av.branch = $2
    ${filterPrefix ? `AND key LIKE '${filterPrefix}%'` : ''}
  `;

  const envResult = await pool.query(query, [app.id, branch]);
  const envVars = envResult.rows;

  // Get Minio credentials for the app
  const isProduction = branch === app.branch;
  const minioCredentials = await fetchAppServiceCredentialsQuery(app.id, 'minio', !isProduction);

  let minioEnvVars = {};
  if (minioCredentials.length) {
    minioEnvVars = getMinioEnvVars(minioCredentials[0]);
  }

  // Convert Minio env vars to the same format as database env vars
  const minioEnvVarsArray = Object.entries(minioEnvVars).map(([key, value]) => ({
    key,
    value
  }));

  return [
    { key: 'IMGPROXY_HOST', value: process.env.IMGPROXY_HOST || '' },
    { key: 'NEXT_PUBLIC_IMGPROXY_HOST', value: process.env.IMGPROXY_HOST || '' },
    ...envVars,
    ...minioEnvVarsArray
  ];
}

async function ensureDockerfile(appDir: string, appName: string): Promise<void> {
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

async function buildImage(appName: string, version: string): Promise<string> {
  const logFile = path.join(getAppsDir(), `log-build-${appName}-${version}.log`);

  try {
    const imageTag = `${appName}:${version}`;
    const appDir = path.join(getAppsDir(), appName);
    
    await logger.info('Building Docker image', { imageTag });
    await logger.info('You can find the build log in the file', { logFile });
    
    // Use shell redirection to write directly to the log file
    await execCommand(`docker build -t ${imageTag} ${appDir} &> ${logFile}`);
    
    // Check if the build output contains any error messages
    const buildOutput = fs.readFileSync(logFile, 'utf8');
    if (buildOutput.includes('ERROR: failed to solve:') || buildOutput.includes('error: failed to solve:')) {
      throw new Error(`Docker build failed: ${buildOutput}`);
    }
    
    // Verify the image was built successfully
    const imageExists = await execCommand(`docker image inspect ${imageTag}`).catch(() => null);
    if (!imageExists) {
      throw new Error('Docker build failed - image not found after build');
    }
    
    await logger.info('Docker image built successfully', { imageTag });

    return imageTag;
  } catch (error) {
    await logger.error(`Error building image`, error as Error);
    throw error;
  } finally {
    // Read log file and log the output
    const logContent = fs.readFileSync(logFile, 'utf8');
    await logger.info('Docker build log', { logContent });
  }
}

async function startContainer(
  containerName: string, 
  imageTag: string, 
  networkName: string, 
  envString: string
): Promise<ContainerInfo> {
  await logger.info('Starting container', { containerName });
  
  await execCommand(
    `docker run -d --restart unless-stopped --name ${containerName} --network ${networkName} ${envString} ${imageTag}`
  );
  
  const containerId = await execCommand(
    `docker inspect --format='{{.Id}}' ${containerName}`
  ) as string;

  await logger.info('Container started successfully', { 
    containerId: containerId.trim(),
    containerName 
  });

  return {
    containerId: containerId.trim(),
    containerName
  };
}

async function buildAndStartContainer(
  app: App, 
  version: string, 
  env: Record<string, string> = {}
): Promise<ContainerInfo> {
  try {
    const appDir = path.join(APPS_DIR, app.name);
    await ensureDockerfile(appDir, app.name);

    await modifyNextConfig(appDir);

    await logger.debug('Fetching environment variables');
    const envVars = await getAppEnvVars(app, env.BRANCH || 'main');

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

    const imageTag = await buildImage(app.name, version);
    const timestamp = new Date().getTime();
    const containerName = `${app.name}_${version}_${timestamp}`;

    const envString = Object.entries(appEnv)
      .map(([key, value]) => `"-e ${key}=${value}"`)
      .join(' ');

    return await startContainer(containerName, imageTag, networkName, envString);
  } catch (error) {
    await logger.error(`Error building and starting container`, error as Error);
    throw error;
  }
}

async function stopContainer(containerId: string): Promise<void> {
  try {
    try {
      await logger.info('Disconnecting container from network', { containerId });
      await execCommand(`docker network disconnect ${networkName} ${containerId}`);
    } catch (e) {
      await logger.warning('Container might already be disconnected from network', { error: (e as Error).message });
    }

    await logger.info('Stopping container', { containerId });
    await execCommand(`docker stop ${containerId}`);
    
    await logger.info('Removing container', { containerId });
    await execCommand(`docker rm ${containerId}`);
    
    await logger.info('Container stopped and removed successfully', { containerId });
  } catch (error) {
    await logger.error(`Error stopping container`, error as Error);
    throw error;
  }
}

async function waitForHealthyContainer(containerId: string, timeout: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  
  await logger.info('Waiting for container to be healthy', { containerId, timeout });
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await execCommand(
        `docker inspect -f '{{.State.Health.Status}}' ${containerId}`
      ) as string;
      
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

async function containerExists(containerId: string): Promise<boolean> {
  try {
    // Use --no-trunc to get full container IDs in the listing
    const result = await execCommand(`docker ps -a --no-trunc -q -f "id=${containerId}"`) as string;
    return result.trim() !== '';
  } catch (error) {
    logger.debug('Container existence check failed', { 
      error: (error as Error).message,
      containerId 
    });
    return false;
  }
}

async function startExistingContainer(containerId: string): Promise<ContainerInfo> {
  await logger.info('Starting existing container', { containerId });
  
  await execCommand(`docker start ${containerId}`);
  
  await logger.info('Container started successfully', { containerId });
  return { containerId };
}

async function imageExists(imageTag: string): Promise<boolean> {
  try {
    const result = await execCommand(`docker image inspect ${imageTag}`);
    return true;
  } catch (error) {
    logger.debug('Image not found', { imageTag });
    return false;
  }
}

async function recoverContainers(): Promise<void> {
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
            const envVars = await getAppEnvVars(deployment, 'main');
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
              deployment,
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
        }) as string | null;

        if (containerStatus && containerStatus.trim() !== 'running') {
          await logger.info(`Container exists but not running, attempting to recover`, { 
            name: deployment.name, 
            status: containerStatus.trim() 
          });
          
          // Double check after a delay to avoid race conditions with docker restart
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const retryStatus = await execCommand(
            `docker inspect -f '{{.State.Status}}' ${deployment.container_id}`
          ).catch(() => null) as string | null;

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
          error: (error as Error).message || 'Unknown error'
        } as any);
      }
    }
  } catch (error) {
    await logger.error('Container recovery failed', error as Error);
    throw error;
  }
}

async function deleteAppContainers(appName: string): Promise<void> {
  try {
    // Find all containers for this app (active and inactive)
    const containers = await execCommand(`docker ps -a --filter "name=${appName}" --format "{{.ID}}"`) as string;
    const containerIds = containers.trim().split('\n').filter(id => id);

    // Stop and remove each container
    for (const containerId of containerIds) {
      await execCommand(`docker stop ${containerId}`);
      await execCommand(`docker rm ${containerId}`);
    }
  } catch (error) {
    await logger.error(`Error deleting containers for ${appName}`, error as Error);
    throw error;
  }
}

async function getServicesHealth(): Promise<ServiceHealth[]> {
  // Use docker compose ps to get status of services containers: postgres, nginx, redis, imgproxy
  const containers = await execCommand(`docker compose ps --format "{{.ID}} {{.Name}} {{.Status}}"`) as string;
  
  // Split output into lines and parse each line
  const lines = containers.split('\n').filter(line => line.trim());
  
  const healthStatus: ServiceHealth[] = lines.map(line => {
    const [id, fullName, ...statusParts] = line.split(' ');
    // Extract service name from full container name (e.g., "port-au-next-nginx-1" -> "nginx")
    const service = fullName.split('-').slice(-2, -1)[0] as Service;
    
    // Parse status string to determine service status
    const statusString = statusParts.join(' ').toLowerCase();
    let status: ServiceStatus = 'unknown';
    
    if (statusString.includes('up') || statusString.includes('running')) {
      status = 'running';
    } else if (statusString.includes('exited') || statusString.includes('stopped')) {
      status = 'stopped';
    }
    
    return {
      id,
      name: fullName,
      status,
      service
    };
  }).filter(status => 
    // Only include our core services
    ['postgres', 'nginx', 'redis', 'minio', 'imgproxy'].includes(status.service)
  );

  return healthStatus;
}

async function getServiceContainerIp(serviceName: string): Promise<string> {
  try {
    const containerId = await execCommand(`docker compose ps -q ${serviceName}`) as string;
    if (!containerId.trim()) {
      throw new Error(`Service ${serviceName} not found`);
    }

    const ip = await execCommand(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerId.trim()}`) as string;
    if (!ip.trim()) {
      throw new Error(`Could not get IP for service ${serviceName}`);
    }

    return ip.trim();
  } catch (error) {
    await logger.error(`Error getting container IP for service ${serviceName}`, error as Error);
    throw error;
  }
}

export {
  buildAndStartContainer,
  startContainer,
  stopContainer,
  waitForHealthyContainer,
  recoverContainers,
  containerExists,
  deleteAppContainers,
  getServicesHealth,
  getServiceContainerIp
}; 