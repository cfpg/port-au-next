import * as fs from 'fs';
import * as path from 'path';

import pool from '~/services/database';
import logger from '~/services/logger';
import { App } from '~/types';
import {
  assertAppProjectLayout,
  getAppProjectDir,
} from '~/utils/appPaths';
import { formatDockerEnvString } from '~/utils/dockerEnv';
import { isAutoMigrateEnabled } from '~/services/appFeatures';
import { runPrismaMigrations } from '~/services/prismaMigrate';
import { modifyNextConfig } from '~/services/nextConfig';
import { updateDeploymentStatus } from '~/services/deploymentStatus';
import {
  getNginxContainerAccessLogPath,
  getNginxContainerErrorLogPath,
} from '~/lib/logPaths';
import { mergeAppEnv } from '~/services/appEnv';
import { syncVercelCronsForApp } from '~/services/vercelCron';
import {
  ensureDockerfile,
  buildReleaseImages,
  startContainer,
  stopContainer,
  waitForContainerReady,
  waitForContainerRunning,
} from '~/services/docker';
import {
  APPLICATION_DOCKER_NETWORK,
  getDeploymentNetworkAlias,
} from '~/lib/deploymentRouting';
import type { NginxApplyResult } from '~/services/nginx';

const networkName = APPLICATION_DOCKER_NETWORK;

export interface RunReleasePipelineParams {
  app: App;
  version: string;
  branch: string;
  appEnv: Record<string, string>;
  deploymentId: number;
  switchTraffic: (
    containerId: string,
    deploymentId: number,
    routingHostname: string
  ) => Promise<NginxApplyResult>;
}

async function setDeploymentStatus(
  deploymentId: number | undefined,
  status: string
): Promise<void> {
  if (deploymentId === undefined) {
    return;
  }
  await updateDeploymentStatus(deploymentId, status);
}

export async function runReleasePipeline(
  params: RunReleasePipelineParams
): Promise<{ containerId: string }> {
  const { app, version, branch, deploymentId, switchTraffic } = params;
  const isPreview = branch !== app.branch;
  const appEnv = await mergeAppEnv(app, branch, params.appEnv, { isPreview });

  logger.setRedactionContext(appEnv);

  const projectDir = getAppProjectDir(app.name, app.root_path);
  await setDeploymentStatus(deploymentId, 'building');
  await logger.info('Phase: build — preparing application', { phase: 'build', version, branch, projectDir });

  assertAppProjectLayout(projectDir);
  await ensureDockerfile(projectDir, app.id);
  await modifyNextConfig(projectDir);

  const envFilePath = path.join(projectDir, '.env');
  const envFileContent = Object.entries(appEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envFilePath, envFileContent, { encoding: 'utf-8' });
  await logger.info('Created .env file for build', { path: envFilePath });

  const buildMigrator = await isAutoMigrateEnabled(app.id);
  const { runnerTag } = await buildReleaseImages(
    app.name,
    version,
    buildMigrator,
    deploymentId,
    projectDir
  );

  const timestamp = Date.now();
  const containerName = `${app.name}_${version}_${timestamp}`;
  const routingHostname = getDeploymentNetworkAlias(deploymentId);
  const envString = formatDockerEnvString(appEnv);

  let greenContainerId: string | undefined;
  let trafficSwitched = false;

  try {
    await logger.info('Phase: build — starting green container', {
      phase: 'build',
      runnerTag,
      routingHostname,
    });
    const { containerId } = await startContainer(
      containerName,
      runnerTag,
      networkName,
      envString,
      { networkAlias: routingHostname }
    );
    greenContainerId = containerId;

    await setDeploymentStatus(deploymentId, 'preflight');
    await logger.info('Phase: preflight — waiting for container process', {
      phase: 'preflight',
      containerId,
      routingHostname,
    });
    await waitForContainerRunning(containerId);

    if (buildMigrator) {
      await setDeploymentStatus(deploymentId, 'migrating');
      await runPrismaMigrations(app.name, version, appEnv, projectDir);
    }

    await setDeploymentStatus(deploymentId, 'preflight');
    await logger.info('Phase: preflight — verifying green HTTP readiness', {
      phase: 'preflight',
      containerId,
      routingHostname,
    });
    await waitForContainerReady(containerId, routingHostname);

    await logger.info('Phase: switch — updating traffic routing', {
      phase: 'switch',
      routingHostname,
    });
    const applyResult = await switchTraffic(
      containerId,
      deploymentId,
      routingHostname
    );
    if (applyResult.status !== 'applied') {
      throw new Error(
        `Traffic switch was not applied: ${applyResult.status} — ${applyResult.reason}`
      );
    }
    trafficSwitched = true;

    const accessLogPath = getNginxContainerAccessLogPath(app.name, deploymentId);
    const errorLogPath = getNginxContainerErrorLogPath(app.name, deploymentId);
    await logger.info('Phase: switch — traffic routing updated', {
      phase: 'switch',
      containerId,
      routingHostname,
      accessLogPath,
      errorLogPath,
    });

    if (!isPreview) {
      try {
        await syncVercelCronsForApp(app, appEnv, projectDir);
      } catch (error) {
        await logger.warning('Traffic switched but cron synchronization failed', {
          containerId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { containerId };
  } catch (error) {
    if (greenContainerId && !trafficSwitched) {
      try {
        await stopContainer(greenContainerId);
      } catch (cleanupError) {
        await logger.warning('Failed to clean up rejected green container', {
          containerId: greenContainerId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }
    throw error;
  }
}
