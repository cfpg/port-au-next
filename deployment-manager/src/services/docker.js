const { exec } = require('child_process');
const { pool } = require('../config/database');

async function startContainer(appName, version, env = {}) {
  const timestamp = new Date().getTime();
  const newContainer = `${appName}_${version}_${timestamp}`;

  try {
    // Build new container
    await execCommand(`docker compose -p port-au-next build ${appName}`);

    // Start new container with environment variables
    const envString = Object.entries(env)
      .map(([key, value]) => `-e ${key}=${value}`)
      .join(' ');

    await execCommand(
      `docker compose -p port-au-next up -d --no-deps --scale ${appName}=1 ${envString} ${appName}`
    );

    // Get new container ID
    const containerId = await execCommand(
      `docker compose -p port-au-next ps -q ${appName}`
    );

    return {
      containerId: containerId.trim(),
      containerName: newContainer
    };
  } catch (error) {
    console.error(`Error starting container: ${error.message}`);
    throw error;
  }
}

async function stopContainer(containerId) {
  try {
    await execCommand(`docker compose -p port-au-next stop ${containerId}`);
    await execCommand(`docker compose -p port-au-next rm -f ${containerId}`);
  } catch (error) {
    console.error(`Error stopping container: ${error.message}`);
    throw error;
  }
}

async function getContainerIp(containerId) {
  try {
    const ip = await execCommand(
      `docker compose -p port-au-next exec ${containerId} hostname -i`
    );
    return ip.trim();
  } catch (error) {
    console.error(`Error getting container IP: ${error.message}`);
    throw error;
  }
}

function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = {
  startContainer,
  stopContainer,
  getContainerIp
}; 