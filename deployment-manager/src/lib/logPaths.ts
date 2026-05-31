import fs from 'fs';
import path from 'path';

import getAppsDir from '~/utils/getAppsDir';

export const LOG_TAIL_DEFAULT_BYTES = 65_536;
export const LOG_TAIL_MAX_BYTES = 262_144;
export const BUILD_LOG_TAIL_MAX_BYTES = 8_192;

export function getDeploymentBuildLogDir(appName: string, deploymentId: number): string {
  return path.join(getAppsDir(), 'logs', appName, String(deploymentId));
}

export function getBuildLogPath(
  appName: string,
  deploymentId: number,
  variant: 'build' | 'build-migrate' = 'build'
): string {
  const fileName = variant === 'build-migrate' ? 'build-migrate.log' : 'build.log';
  return path.join(getDeploymentBuildLogDir(appName, deploymentId), fileName);
}

export function getLegacyBuildLogPath(
  appName: string,
  version: string,
  suffix = ''
): string {
  return path.join(getAppsDir(), `log-build-${appName}-${version}${suffix}.log`);
}

export function getNginxLogsRoot(): string {
  return path.join(getAppsDir(), '../nginx/logs');
}

export function getNginxDeploymentLogDir(appName: string, deploymentId: number): string {
  return path.join(getNginxLogsRoot(), 'apps', appName, String(deploymentId));
}

export function getNginxAccessLogPath(appName: string, deploymentId: number): string {
  return path.join(getNginxDeploymentLogDir(appName, deploymentId), 'access.log');
}

export function getNginxErrorLogPath(appName: string, deploymentId: number): string {
  return path.join(getNginxDeploymentLogDir(appName, deploymentId), 'error.log');
}

/** Paths as written in nginx config (inside the nginx container). */
export function getNginxContainerAccessLogPath(appName: string, deploymentId: number): string {
  return `/var/log/nginx/apps/${appName}/${deploymentId}/access.log`;
}

export function getNginxContainerErrorLogPath(appName: string, deploymentId: number): string {
  return `/var/log/nginx/apps/${appName}/${deploymentId}/error.log`;
}

export function ensureDeploymentBuildLogDir(appName: string, deploymentId: number): void {
  fs.mkdirSync(getDeploymentBuildLogDir(appName, deploymentId), { recursive: true });
}
