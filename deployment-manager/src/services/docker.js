const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('./logger');

const APPS_DIR = process.env.HOST_APPS_DIR || '/app/apps';

const networkName = 'port-au-next_port_au_next_network';

async function execCommand(command) {
  return new Promise((resolve, reject) => {
    logger.debug(`Executing command`, { command });
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logger.error('Command execution failed', { error, stderr });
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

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
    
    await logger.info('Building Docker image', { imageTag });
    await execCommand(`docker build -t ${imageTag} ${appDir}`);
    
    await logger.info('Docker image built successfully', { imageTag });
    return imageTag;
  } catch (error) {
    await logger.error(`Error building image`, error);
    throw error;
  }
}

async function startContainer(appName, version, env = {}) {
  try {
    const appDir = path.join(APPS_DIR, appName);
    await ensureDockerfile(appDir, appName);

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

    await logger.info('Starting container', { containerName });
    const envString = Object.entries(appEnv)
      .map(([key, value]) => `"-e ${key}=${value}"`)
      .join(' ');

    await execCommand(
      `docker run -d --restart unless-stopped --name ${containerName} --network ${networkName} ${envString} ${imageTag}`
    );
    
    const containerId = await execCommand(
      `docker inspect -f '{{.Id}}' ${containerName}`
    );

    await logger.info('Container started successfully', { 
      containerId: containerId.trim(),
      containerName 
    });

    return {
      containerId: containerId.trim(),
      containerName
    };
  } catch (error) {
    await logger.error(`Error starting container`, error);
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

async function getContainerIp(containerId) {
  try {
    await logger.debug('Getting container IP', { containerId });
    const ip = await execCommand(
      `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerId}`
    );
    await logger.debug('Got container IP', { containerId, ip: ip.trim() });
    return ip.trim();
  } catch (error) {
    await logger.error(`Error getting container IP`, error);
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

module.exports = {
  startContainer,
  stopContainer,
  getContainerIp,
  waitForHealthyContainer
}; 