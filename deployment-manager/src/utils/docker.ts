import { exec } from 'child_process';
import logger from '~/services/logger';
import {
  getActiveRedactionSecrets,
  redactLogText,
} from '~/lib/redactLogs';

function getPlatformSecrets(): string[] {
  return [
    process.env.MINIO_ROOT_USER,
    process.env.MINIO_ROOT_PASSWORD,
    process.env.POSTGRES_PASSWORD,
    process.env.DEPLOYMENT_MANAGER_AUTH_PASSWORD,
    process.env.PORT_SCHEDULE_MASTER_API_KEY,
    process.env.UMAMI_ADMIN_PASSWORD,
    process.env.UMAMI_APP_SECRET,
    process.env.UMAMI_DB_PASSWORD,
    process.env.BUGSINK_ADMIN_PASSWORD,
    process.env.BUGSINK_SECRET_KEY,
    process.env.BUGSINK_DB_PASSWORD,
    process.env.BUGSINK_API_TOKEN,
    process.env.BETTER_AUTH_SECRET,
  ].filter((value): value is string => Boolean(value));
}

export async function execCommand(command: string) {
  const redactedCommand = redactLogText(command, [
    ...getActiveRedactionSecrets(),
    ...getPlatformSecrets(),
  ]);

  return new Promise((resolve, reject) => {
    logger.debug('Executing command', { command: redactedCommand });
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
