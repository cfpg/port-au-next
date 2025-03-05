const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pool } = require('./database');

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

async function ensureDockerfile(appDir) {
  const dockerfilePath = path.join(appDir, 'Dockerfile');
  
  if (!fs.existsSync(dockerfilePath)) {
    console.log('No Dockerfile found, creating one...');
    const dockerfile = `
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
`;
    fs.writeFileSync(dockerfilePath, dockerfile);
  }
}

async function buildImage(appName, version) {
  const appDir = path.join(APPS_DIR, appName);
  const imageTag = `${appName}:${version}`;
  
  await execCommand(`docker build -t ${imageTag} ${appDir}`);
  return imageTag;
}

async function startContainer(appName, version, env = {}) {
  try {
    // Get app's environment variables from database
    const envResult = await pool.query(`
      SELECT key, value 
      FROM app_env_vars av
      JOIN apps a ON a.id = av.app_id
      WHERE a.name = $1 AND av.branch = $2
    `, [appName, env.BRANCH || 'main']);

    // Combine default env vars with app-specific ones
    const appEnv = {
      ...env,
      ...Object.fromEntries(envResult.rows.map(row => [row.key, row.value]))
    };

    // Ensure Dockerfile exists
    const appDir = path.join(APPS_DIR, appName);
    await ensureDockerfile(appDir);

    // Build new image
    console.log(`Building image for ${appName}...`);
    const imageTag = await buildImage(appName, version);

    // Create container name
    const timestamp = new Date().getTime();
    const containerName = `${appName}_${version}_${timestamp}`;

    // Start new container with environment variables
    console.log(`Starting container ${containerName}...`);
    const envString = Object.entries(appEnv)
      .map(([key, value]) => `-e ${key}=${value}`)
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