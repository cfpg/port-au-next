import { exec } from 'child_process';
import logger from '~/services/logger';

export async function execCommand(command: string) {
  return new Promise((resolve, reject) => {
    logger.debug(`Executing command`, { command });
    exec(command, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        logger.error('Command execution failed', error);
        logger.error('Command execution failed', new Error(stderr));
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

export async function getContainerIp(containerId: string) {
  try {
    await logger.debug('Getting container IP', { containerId });
    const ip = await execCommand(
      `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerId}`
    ) as string;
    await logger.debug('Got container IP', { containerId, ip: ip.trim() });
    return ip.trim();
  } catch (error) {
    await logger.error(`Error getting container IP`, error as Error);
    throw error;
  }
}
