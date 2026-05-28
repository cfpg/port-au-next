import * as fs from 'fs';
import * as path from 'path';

import pool from '~/services/database';
import logger from '~/services/logger';
import { App } from '~/types';
import getAppsDir from '~/utils/getAppsDir';
import { formatDockerEnvString } from '~/utils/dockerEnv';
import { isAutoMigrateEnabled } from '~/services/appFeatures';
import { runPrismaMigrations } from '~/services/prismaMigrate';
import { modifyNextConfig } from '~/services/nextConfig';
import {
  ensureDockerfile,
  buildReleaseImages,
  startContainer,
  waitForContainerRunning,
} from '~/services/docker';

const networkName = 'port-au-next_port_au_next_network';

export interface RunReleasePipelineParams {
  app: App;
  version: string;
  branch: string;
  appEnv: Record<string, string>;
  deploymentId?: number;
  switchTraffic: (containerId: string) => Promise<void>;
}

async function setDeploymentStatus(
  deploymentId: number | undefined,
  status: string
): Promise<void> {
  if (deploymentId === undefined) {
    return;
  }
  await pool.query('UPDATE deployments SET status = $1 WHERE id = $2', [
    status,
    deploymentId,
  ]);
}

export async function runReleasePipeline(
  params: RunReleasePipelineParams
): Promise<{ containerId: string }> {
  const { app, version, branch, appEnv, deploymentId, switchTraffic } = params;

  const appDir = path.join(getAppsDir(), app.name);
  await setDeploymentStatus(deploymentId, 'building');
  await logger.info('Phase: build — preparing application', { phase: 'build', version, branch });

  await ensureDockerfile(appDir, app.id);
  await modifyNextConfig(appDir);

  const envFilePath = path.join(appDir, '.env');
  const envFileContent = Object.entries(appEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envFilePath, envFileContent, { encoding: 'utf-8' });
  await logger.info('Created .env file for build', { path: envFilePath });

  const buildMigrator = await isAutoMigrateEnabled(app.id);
  const { runnerTag } = await buildReleaseImages(app.name, version, buildMigrator);

  const timestamp = Date.now();
  const containerName = `${app.name}_${version}_${timestamp}`;
  const envString = formatDockerEnvString(appEnv);

  await logger.info('Phase: build — starting green container', { phase: 'build', runnerTag });
  const { containerId } = await startContainer(
    containerName,
    runnerTag,
    networkName,
    envString
  );

  await setDeploymentStatus(deploymentId, 'preflight');
  await logger.info('Phase: preflight — waiting for container to be running', {
    phase: 'preflight',
    containerId,
  });
  await waitForContainerRunning(containerId);
  await logger.info('Phase: preflight — container is running', { phase: 'preflight', containerId });

  if (buildMigrator) {
    await setDeploymentStatus(deploymentId, 'migrating');
    await runPrismaMigrations(app.name, version, appEnv);
  }

  await logger.info('Phase: switch — updating traffic routing', { phase: 'switch' });
  await switchTraffic(containerId);
  await logger.info('Phase: switch — traffic routing updated', { phase: 'switch', containerId });

  return { containerId };
}
