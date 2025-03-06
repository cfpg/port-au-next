const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const APPS_DIR = process.env.HOST_APPS_DIR || '/app/apps';

const networkName = 'port-au-next_port_au_next_network';

async function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('Command error:', error);
        console.error('stderr:', stderr);
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
    console.log('No Dockerfile found, creating one...');

    // Get all NEXT_PUBLIC_ env vars for this app
    const envVars = await getAppEnvVars(appName, 'main', 'NEXT_PUBLIC_');

    // Generate ARG and ENV statements for each NEXT_PUBLIC_ variable
    const envStatements = envVars
      .map(row => `
ARG ${row.key}
ENV ${row.key}=\${${row.key}}`)
      .join('\n');

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
RUN npx prisma generate
RUN npm run build

# 3. Production image, copy all the files and run next
FROM node:20-alpine3.20 AS runner
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
  } else {
    console.log('Dockerfile already exists, using it...');
  }
}

async function buildImage(appName, version) {
  try {
    const imageTag = `${appName}:${version}`;
    const appDir = path.join(APPS_DIR, appName);
    
    await execCommand(
      `docker build -t ${imageTag} ${appDir}`
    );
    
    return imageTag;
  } catch (error) {
    console.error(`Error building image: ${error.message}`);
    throw error;
  }
}

async function startContainer(appName, version, env = {}) {
  try {
    // Ensure Dockerfile exists
    const appDir = path.join(APPS_DIR, appName);
    await ensureDockerfile(appDir, appName);

    // Get app's environment variables from database
    const envVars = await getAppEnvVars(appName, env.BRANCH || 'main');

    // Combine default env vars with app-specific ones
    const appEnv = {
      ...env,
      ...Object.fromEntries(envVars.map(row => [row.key, row.value]))
    };

    // Write .env file
    const envFilePath = path.join(appDir, '.env');
    const envFileContent = Object.entries(appEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(envFilePath, envFileContent, { encoding: 'utf-8' });
    console.log(`Created .env file at ${envFilePath}`);

    // Build new image
    console.log(`Building image for ${appName}...`);
    const imageTag = await buildImage(appName, version);

    // Create container name
    const timestamp = new Date().getTime();
    const containerName = `${appName}_${version}_${timestamp}`;

    // Start new container with environment variables
    console.log(`Starting container ${containerName}...`);
    const envString = Object.entries(appEnv)
      .map(([key, value]) => `"-e ${key}=${value}"`)
      .join(' ');

    // Run container and connect to network at startup
    await execCommand(
      `docker run -d --name ${containerName} --network ${networkName} ${envString} ${imageTag}`
    );
    
    // Get container ID
    const containerId = await execCommand(
      `docker inspect -f '{{.Id}}' ${containerName}`
    );

    return {
      containerId: containerId.trim(),
      containerName
    };
  } catch (error) {
    console.error(`Error starting container: ${error.message}`);
    throw error;
  }
}

async function stopContainer(containerId) {
  try {
    // Disconnect from network first
    try {
      await execCommand(
        `docker network disconnect ${networkName} ${containerId}`
      );
    } catch (e) {
      console.log('Container might already be disconnected from network');
    }

    // Stop and remove container
    await execCommand(`docker stop ${containerId}`);
    await execCommand(`docker rm ${containerId}`);
  } catch (error) {
    console.error(`Error stopping container: ${error.message}`);
    throw error;
  }
}

async function getContainerIp(containerId) {
  try {
    const ip = await execCommand(
      `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerId}`
    );
    return ip.trim();
  } catch (error) {
    console.error(`Error getting container IP: ${error.message}`);
    throw error;
  }
}

// Helper to check container health
async function waitForHealthyContainer(containerId, timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await execCommand(
        `docker inspect -f '{{.State.Health.Status}}' ${containerId}`
      );
      
      if (status.trim() === 'healthy') {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log('Waiting for container to be healthy...');
    }
  }
  
  throw new Error('Container health check timeout');
}

module.exports = {
  startContainer,
  stopContainer,
  getContainerIp,
  waitForHealthyContainer
}; 