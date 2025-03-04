const { exec } = require('child_process');
const { pool } = require('../config/database');

async function startContainer(appName, version, env = {}) {
  const timestamp = new Date().getTime();
  const newContainer = `${appName}_${version}_${timestamp}`;

  try {
    // Build new container
    await execCommand(`docker-compose build ${appName}`);

    // Start new container with environment variables
    const envString = Object.entries(env)
      .map(([key, value]) => `-e ${key}=${value}`)
      .join(' ');

    await execCommand(
      `docker-compose -p ${newContainer} up -d --no-deps --scale ${appName}=1 ${envString} ${appName}`
    );

    // Get new container ID
    const containerId = await execCommand(
      `docker-compose -p ${newContainer} ps -q ${appName}`
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