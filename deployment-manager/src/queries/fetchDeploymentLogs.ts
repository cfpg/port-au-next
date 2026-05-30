import pool from '~/services/database';
import fetchLogs from '~/queries/fetchLogs';
import {
  getBuildLogPath,
  getNginxAccessLogPath,
  getNginxErrorLogPath,
} from '~/lib/logPaths';
import { LogFileNotFoundError, readLogTail } from '~/lib/readLogFile';
import { DeploymentLog } from '~/types';

export type DeploymentLogType = 'deploy' | 'access' | 'error' | 'build';

const VALID_LOG_TYPES = new Set<DeploymentLogType>(['deploy', 'access', 'error', 'build']);

export function isValidLogType(value: string): value is DeploymentLogType {
  return VALID_LOG_TYPES.has(value as DeploymentLogType);
}

async function verifyDeployment(appName: string, deploymentId: number) {
  const result = await pool.query<{ id: number; app_name: string }>(
    `SELECT d.id, a.name AS app_name
     FROM deployments d
     JOIN apps a ON a.id = d.app_id
     WHERE a.name = $1 AND d.id = $2
     LIMIT 1`,
    [appName, deploymentId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return result.rows[0];
}

function resolveLogPath(
  appName: string,
  deploymentId: number,
  logType: Exclude<DeploymentLogType, 'deploy'>
): string {
  switch (logType) {
    case 'access':
      return getNginxAccessLogPath(appName, deploymentId);
    case 'error':
      return getNginxErrorLogPath(appName, deploymentId);
    case 'build':
      return getBuildLogPath(appName, deploymentId);
  }
}

export async function fetchDeploymentDeployLogs(
  appName: string,
  deploymentId: number
): Promise<{ logs: DeploymentLog[] }> {
  const { logs } = await fetchLogs(appName, deploymentId);
  return { logs };
}

export async function fetchDeploymentFileLog(
  appName: string,
  deploymentId: number,
  logType: Exclude<DeploymentLogType, 'deploy'>,
  requestedBytes?: number
) {
  const deployment = await verifyDeployment(appName, deploymentId);
  if (!deployment) {
    return { error: 'not_found' as const };
  }

  const path = resolveLogPath(appName, deploymentId, logType);

  try {
    const { content, sizeBytes, truncated } = readLogTail(path, requestedBytes);
    return {
      deploymentId,
      appName,
      path,
      sizeBytes,
      truncated,
      content,
    };
  } catch (error) {
    if (error instanceof LogFileNotFoundError) {
      return { error: 'log_not_found' as const };
    }
    throw error;
  }
}
