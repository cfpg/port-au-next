const { exec } = require('child_process');
const logger = require('../services/logger');

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

module.exports = {
  execCommand,
  getContainerIp
}; 