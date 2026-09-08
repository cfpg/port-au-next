import fs from 'fs';
import path from 'path';

import {
  getNginxDeploymentLogDir,
  getNginxLogsRoot,
} from '~/lib/logPaths';

const DIRECTORY_MODE = 0o2775;

function assertPathInsideRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid nginx log path');
  }
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

  const logsRoot = path.resolve(getNginxLogsRoot(), 'apps');
  const logDir = path.resolve(getNginxDeploymentLogDir(appName, deploymentId));
  assertPathInsideRoot(logsRoot, logDir);

  fs.mkdirSync(logDir, { recursive: true, mode: DIRECTORY_MODE });
  fs.chmodSync(logDir, DIRECTORY_MODE);
}
