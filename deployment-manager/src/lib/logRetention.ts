import fs from 'fs';
import path from 'path';

import pool from '~/services/database';
import logger from '~/services/logger';
import getAppsDir from '~/utils/getAppsDir';
import {
  getDeploymentBuildLogDir,
  getLegacyBuildLogPath,
  getNginxDeploymentLogDir,
} from '~/lib/logPaths';

const DEFAULT_RETENTION_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getRetentionDays(): number {
  const parsed = Number(process.env.LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

function removePath(targetPath: string): boolean {
  try {
    if (!fs.existsSync(targetPath)) {
      return false;
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    logger.warning('Failed to remove log path during retention cleanup', {
      targetPath,
      error: (error as Error).message,
    });
    return false;
  }
}

export async function runLogRetentionCleanup(): Promise<{
  deploymentsProcessed: number;
  pathsRemoved: number;
}> {
  const retentionDays = getRetentionDays();
  const result = await pool.query<{
    id: number;
    version: string;
    app_name: string;
  }>(
    `SELECT d.id, d.version, a.name AS app_name
     FROM deployments d
     JOIN apps a ON a.id = d.app_id
     WHERE d.status IN ('inactive', 'failed')
       AND COALESCE(d.failed_at, d.inactive_at) < NOW() - ($1::int * INTERVAL '1 day')`,
    [retentionDays]
  );

  let pathsRemoved = 0;

  for (const row of result.rows) {
    const nginxDir = getNginxDeploymentLogDir(row.app_name, row.id);
    const buildDir = getDeploymentBuildLogDir(row.app_name, row.id);
    const legacyBuild = getLegacyBuildLogPath(row.app_name, row.version);
    const legacyMigrate = getLegacyBuildLogPath(row.app_name, row.version, '-migrate');

    if (removePath(nginxDir)) pathsRemoved += 1;
    if (removePath(buildDir)) pathsRemoved += 1;
    if (removePath(legacyBuild)) pathsRemoved += 1;
    if (removePath(legacyMigrate)) pathsRemoved += 1;

    await pool.query('DELETE FROM deployment_logs WHERE deployment_id = $1', [row.id]);
  }

  if (result.rows.length > 0) {
    await logger.info('Log retention cleanup completed', {
      deploymentsProcessed: result.rows.length,
      pathsRemoved,
      retentionDays,
    });
  }

  return { deploymentsProcessed: result.rows.length, pathsRemoved };
}

let retentionInterval: ReturnType<typeof setInterval> | null = null;

export function scheduleLogRetentionCleanup(): void {
  if (retentionInterval) {
    return;
  }

  const run = () => {
    runLogRetentionCleanup().catch((error) => {
      logger.error('Log retention cleanup failed', error as Error);
    });
  };

  run();
  retentionInterval = setInterval(run, MS_PER_DAY);
}
