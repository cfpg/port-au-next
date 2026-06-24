import logger from '~/services/logger';
import { execCompose } from '~/utils/compose';

async function execInNginxContainer(shellScript: string): Promise<void> {
  const command = `exec -T nginx sh -c ${shellQuote(shellScript)}`;

  try {
    await execCompose(command);
  } catch (error) {
    await logger.error('nginx container command failed', error as Error);
    throw error;
  }
}

/** deployment-manager container runs as node (Alpine node image). */
const NODE_UID = 1000;
/** nginx worker user/group in nginx:alpine. */
const NGINX_USER = 'nginx';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Ensures /var/log/nginx/apps exists and is writable by deployment-manager (node)
 * while allowing nginx to write log files in per-deployment subdirectories.
 */
export async function ensureNginxAppsLogRoot(): Promise<void> {
  await execInNginxContainer(
    `mkdir -p /var/log/nginx/apps && chown ${NODE_UID}:${NGINX_USER} /var/log/nginx/apps && chmod 2775 /var/log/nginx/apps`
  );
}

export async function ensureNginxDeploymentLogDir(
  appName: string,
  deploymentId: number
): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(appName)) {
    throw new Error(`Invalid app name for nginx log path: ${appName}`);
  }
  if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
    throw new Error(`Invalid deployment id for nginx log path: ${deploymentId}`);
  }

  const logDir = `/var/log/nginx/apps/${appName}/${deploymentId}`;
  await execInNginxContainer(
    `mkdir -p ${logDir} && chown -R ${NGINX_USER}:${NGINX_USER} ${logDir} && chmod 775 ${logDir}`
  );
}
