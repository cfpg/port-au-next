import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getActiveDeployments, updateDeploymentContainer, deduplicateActiveDeployments, cleanupStaleBuildingDeployments, cleanupOrphanedPreviewDeployments } from '~/services/database';
import { updateNginxConfig } from '~/services/nginx';
import logger from '~/services/logger';
import { modifyNextConfig } from '~/services/nextConfig';

import { execCommand } from '~/utils/docker';
import { formatDockerEnvString } from '~/utils/dockerEnv';
import getAppsDir from '~/utils/getAppsDir';
import { migratorImageTag } from '~/services/prismaMigrate';
import { ServiceStatus } from '~/types';
import { Service } from '~/types';
import { ServiceHealth } from '~/types';
import { mergeAppEnv } from '~/services/appEnv';
import { App } from '~/types';
import { isUsesPrismaEnabled } from '~/services/appFeatures';
import { buildGeneratedDockerfileContent } from '~/services/generatedDockerfileTemplates';
import {
  BUILD_LOG_TAIL_MAX_BYTES,
  ensureDeploymentBuildLogDir,
  getBuildLogPath,
} from '~/lib/logPaths';
import { readLogTail } from '~/lib/readLogFile';
import {
  redactLogText,
  withAdditionalRedactionSecrets,
} from '~/lib/redactLogs';
import {
  assertAppProjectLayout,
  getAppProjectDir,
} from '~/utils/appPaths';
import {
  buildDesiredGeneratedDockerfileMarker,
  parseGeneratedDockerfileMarker,
  shouldRegenerateGeneratedDockerfile,
} from '~/utils/generatedDockerfileMarker';
import {
  APPLICATION_DOCKER_NETWORK,
  assertDockerDnsName,
  getContainerRoutingHostname,
  getDeploymentNetworkAlias,
} from '~/lib/deploymentRouting';

interface ContainerInfo {
  containerId: string;
  containerName?: string;
  routingHostname?: string;
}

// Constants
const APPS_DIR: string = getAppsDir();
const networkName: string = APPLICATION_DOCKER_NETWORK;

async function ensureDockerfile(appDir: string, appId: number): Promise<boolean> {
  const dockerfilePath = path.join(appDir, 'Dockerfile');
  const usesPrisma = await isUsesPrismaEnabled(appId);
  const markerLine = buildDesiredGeneratedDockerfileMarker(usesPrisma);
  const dockerfileContent = buildGeneratedDockerfileContent(usesPrisma, markerLine);

  if (!fs.existsSync(dockerfilePath)) {
    await logger.info('No Dockerfile found, creating platform Dockerfile', {
      usesPrisma,
      marker: markerLine,
    });
    fs.writeFileSync(dockerfilePath, dockerfileContent);
    return true;
  }

  const existingContent = fs.readFileSync(dockerfilePath, 'utf8');
  const parsed = parseGeneratedDockerfileMarker(existingContent);

  if (!parsed) {
    await logger.debug('Using existing Dockerfile (not platform-managed)');
    return false;
  }

  if (!shouldRegenerateGeneratedDockerfile(parsed, usesPrisma)) {
    await logger.debug('Using existing platform-managed Dockerfile', {
      marker: parsed.raw,
    });
    return true;
  }

  await logger.info('Regenerating platform-managed Dockerfile', {
    previousMarker: parsed.raw,
    usesPrisma,
    marker: markerLine,
  });
  fs.writeFileSync(dockerfilePath, dockerfileContent);
  return true;
}

export interface BugsinkSourceMapBuild {
  url: string;
  projectSlug: string;
  authToken: string;
}

interface BuildImageOptions {
  target?: string;
  imageTag?: string;
  deploymentId?: number;
  buildVariant?: 'build' | 'build-migrate';
  projectDir?: string;
  bugsinkSourceMaps?: BugsinkSourceMapBuild;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function buildImage(
  appName: string,
  version: string,
  options: BuildImageOptions = {}
): Promise<string> {
  if (options.deploymentId === undefined) {
    throw new Error('deploymentId is required to write build logs');
  }

  const buildVariant = options.buildVariant ?? 'build';
  ensureDeploymentBuildLogDir(appName, options.deploymentId);
  const logFile = getBuildLogPath(appName, options.deploymentId, buildVariant);
  let secretDir: string | undefined;

  try {
    const imageTag = options.imageTag ?? `${appName}:${version}`;
    const projectDir = options.projectDir ?? path.join(getAppsDir(), appName);
    const dockerfilePath = path.join(projectDir, 'Dockerfile');
    const targetArg = options.target ? ` --target ${options.target}` : '';
    let sourceMapArgs = '';

    if (options.bugsinkSourceMaps) {
      secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'port-au-next-bugsink-'));
      fs.chmodSync(secretDir, 0o700);
      const secretPath = path.join(secretDir, 'auth-token');
      fs.writeFileSync(secretPath, options.bugsinkSourceMaps.authToken, {
        encoding: 'utf8',
        mode: 0o600,
      });

      sourceMapArgs = [
        ` --secret id=bugsink_auth_token,src=${shellQuote(secretPath)}`,
        ' --build-arg BUGSINK_SOURCEMAPS=true',
        ` --build-arg BUGSINK_URL=${shellQuote(options.bugsinkSourceMaps.url)}`,
        ` --build-arg BUGSINK_PROJECT_SLUG=${shellQuote(options.bugsinkSourceMaps.projectSlug)}`,
      ].join('');
    }

    await logger.info('Building Docker image', { imageTag, target: options.target, projectDir });
    await logger.info('Build log file', { buildLogPath: logFile });

    await execCommand(
      `DOCKER_BUILDKIT=1 docker build${targetArg}${sourceMapArgs} -t ${shellQuote(imageTag)} -f ${shellQuote(dockerfilePath)} ${shellQuote(projectDir)} &> ${shellQuote(logFile)}`,
      { redactionSecrets: options.bugsinkSourceMaps ? [options.bugsinkSourceMaps.authToken] : [] }
    );

    const buildOutput = fs.readFileSync(logFile, 'utf8');
    if (
      buildOutput.includes('ERROR: failed to solve:') ||
      buildOutput.includes('error: failed to solve:')
    ) {
      throw new Error(`Docker build failed: ${buildOutput}`);
    }

    const imageExists = await execCommand(`docker image inspect ${imageTag}`).catch(
      () => null
    );
    if (!imageExists) {
      throw new Error('Docker build failed - image not found after build');
    }

    await logger.info('Docker image built successfully', { imageTag });

    return imageTag;
  } catch (error) {
    await logger.error(`Error building image`, error as Error);
    throw error;
  } finally {
    if (secretDir) {
      fs.rmSync(secretDir, { recursive: true, force: true });
    }
    if (fs.existsSync(logFile)) {
      const { content, sizeBytes } = readLogTail(logFile, BUILD_LOG_TAIL_MAX_BYTES);
      await logger.info('Docker build log', {
        buildLogPath: logFile,
        sizeBytes,
        tailRedacted: content
          ? redactLogText(
              content,
              options.bugsinkSourceMaps
                ? withAdditionalRedactionSecrets([
                    options.bugsinkSourceMaps.authToken,
                  ])
                : undefined
            )
          : undefined,
      });
    }
  }
}

async function buildReleaseImages(
  appName: string,
  version: string,
  buildMigrator: boolean,
  deploymentId: number,
  projectDir: string,
  bugsinkSourceMaps?: BugsinkSourceMapBuild
): Promise<{ runnerTag: string; migratorTag?: string }> {
  const runnerTag = await buildImage(appName, version, {
    deploymentId,
    projectDir,
    bugsinkSourceMaps,
  });

  if (!buildMigrator) {
    return { runnerTag };
  }

  const migrateTag = migratorImageTag(appName, version);
  await buildImage(appName, version, {
    target: 'migrator',
    imageTag: migrateTag,
    deploymentId,
    buildVariant: 'build-migrate',
    projectDir,
  });

  return { runnerTag, migratorTag: migrateTag };
}

async function waitForContainerRunning(
  containerId: string,
  timeout: number = 60000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = (await execCommand(
      `docker inspect -f '{{.State.Status}}' ${containerId}`
    )) as string;
    const normalized = status.trim();

    if (normalized === 'running') {
      return;
    }

    if (normalized === 'exited' || normalized === 'dead') {
      throw new Error(`Container entered ${normalized} state during preflight`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Container preflight timeout — not running before deadline');
}

async function startContainer(
  containerName: string, 
  imageTag: string, 
  networkName: string, 
  envString: string,
  options: { networkAlias?: string } = {}
): Promise<ContainerInfo> {
  const networkAlias = options.networkAlias
    ? assertDockerDnsName(options.networkAlias)
    : undefined;
  const networkAliasArg = networkAlias ? ` --network-alias ${networkAlias}` : '';

  await logger.info('Starting container', { containerName, networkAlias });
  
  await execCommand(
    `docker run -d --restart unless-stopped --name ${containerName} --network ${networkName}${networkAliasArg} ${envString} ${imageTag}`
  );
  
  const containerId = await execCommand(
    `docker inspect --format='{{.Id}}' ${containerName}`
  ) as string;

  await logger.info('Container started successfully', { 
    containerId: containerId.trim(),
    containerName 
  });

  return {
    containerId: containerId.trim(),
    containerName,
    routingHostname: networkAlias ?? assertDockerDnsName(containerName),
  };
}

async function buildAndStartContainer(
  app: App, 
  version: string, 
  env: Record<string, string> = {},
  deploymentId?: number
): Promise<ContainerInfo> {
  try {
    const projectDir = getAppProjectDir(app.name, app.root_path);
    assertAppProjectLayout(projectDir);
    await ensureDockerfile(projectDir, app.id);

    await modifyNextConfig(projectDir);

    const targetBranch = env.BRANCH || app.branch || 'main';
    const appEnv = await mergeAppEnv(app, targetBranch, env);

    const envFilePath = path.join(projectDir, '.env');
    const envFileContent = Object.entries(appEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(envFilePath, envFileContent, { encoding: 'utf-8' });
    await logger.info('Created .env file', { path: envFilePath });

    if (deploymentId === undefined) {
      throw new Error('deploymentId is required for buildAndStartContainer');
    }

    const { runnerTag } = await buildReleaseImages(app.name, version, false, deploymentId, projectDir);
    const timestamp = new Date().getTime();
    const containerName = `${app.name}_${version}_${timestamp}`;

    const envString = formatDockerEnvString(appEnv);

    return await startContainer(containerName, runnerTag, networkName, envString, {
      networkAlias: getDeploymentNetworkAlias(deploymentId),
    });
  } catch (error) {
    await logger.error(`Error building and starting container`, error as Error);
    throw error;
  }
}

async function stopContainer(containerId: string): Promise<void> {
  try {
    try {
      await logger.info('Disconnecting container from network', { containerId });
      await execCommand(`docker network disconnect ${networkName} ${containerId}`);
    } catch (e) {
      await logger.warning('Container might already be disconnected from network', { error: (e as Error).message });
    }

    try {
      await logger.info('Stopping container', { containerId });
      await execCommand(`docker stop ${containerId}`);

      await logger.info('Removing container', { containerId });
      await execCommand(`docker rm ${containerId}`);

      await logger.info('Container stopped and removed successfully', { containerId });
    } catch (e) {
      // Container may have already been removed externally - not a fatal error
      await logger.warning('Container could not be stopped (may not exist)', {
        containerId,
        error: (e as Error).message
      });
    }
  } catch (error) {
    await logger.error(`Error stopping container`, error as Error);
    throw error;
  }
}

async function waitForHealthyContainer(containerId: string, timeout: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  
  await logger.info('Waiting for container to be healthy', { containerId, timeout });
  
  while (Date.now() - startTime < timeout) {
    try {
      const status = await execCommand(
        `docker inspect -f '{{.State.Health.Status}}' ${containerId}`
      ) as string;
      
      if (status.trim() === 'healthy') {
        await logger.info('Container is healthy', { containerId });
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      await logger.debug('Container health check pending...', { containerId });
    }
  }
  
  const error = new Error('Container health check timeout');
  await logger.error('Container health check failed', error);
  throw error;
}

async function hasDockerHealthcheck(containerId: string): Promise<boolean> {
  const healthcheckJson = (await execCommand(
    `docker inspect --format '{{json .Config.Healthcheck}}' ${containerId}`
  )) as string;

  if (!healthcheckJson.trim() || healthcheckJson.trim() === 'null') {
    return false;
  }

  const healthcheck = JSON.parse(healthcheckJson) as { Test?: string[] };
  return Boolean(
    healthcheck.Test?.length && healthcheck.Test[0]?.toUpperCase() !== 'NONE'
  );
}

async function probeContainerHttp(routingHostname: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`http://${routingHostname}:3000/`, {
      redirect: 'manual',
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Requires the container to accept HTTP traffic before nginx can route to it.
 * A custom Docker healthcheck is also honored when one is configured.
 */
async function waitForContainerReady(
  containerId: string,
  routingHostname: string,
  timeout: number = 60000
): Promise<void> {
  const hostname = assertDockerDnsName(routingHostname);
  const usesDockerHealthcheck = await hasDockerHealthcheck(containerId);
  const startedAt = Date.now();

  await logger.info('Waiting for container readiness', {
    containerId,
    routingHostname: hostname,
    usesDockerHealthcheck,
    timeout,
  });

  while (Date.now() - startedAt < timeout) {
    const status = ((await execCommand(
      `docker inspect --format '{{.State.Status}}' ${containerId}`
    )) as string).trim();

    if (status === 'exited' || status === 'dead') {
      throw new Error(`Container entered ${status} state during readiness check`);
    }

    if (status === 'running') {
      let dockerHealthy = true;
      if (usesDockerHealthcheck) {
        const healthStatus = ((await execCommand(
          `docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' ${containerId}`
        )) as string).trim();
        dockerHealthy = healthStatus === 'healthy';
      }

      if (dockerHealthy && (await probeContainerHttp(hostname))) {
        await logger.info('Container readiness passed', {
          containerId,
          routingHostname: hostname,
          usesDockerHealthcheck,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Container readiness timeout for ${hostname} after ${timeout}ms`
  );
}

async function containerExists(containerId: string): Promise<boolean> {
  try {
    // Use --no-trunc to get full container IDs in the listing
    const result = await execCommand(`docker ps -a --no-trunc -q -f "id=${containerId}"`) as string;
    return result.trim() !== '';
  } catch (error) {
    logger.debug('Container existence check failed', { 
      error: (error as Error).message,
      containerId 
    });
    return false;
  }
}

async function startExistingContainer(containerId: string): Promise<ContainerInfo> {
  await logger.info('Starting existing container', { containerId });
  
  await execCommand(`docker start ${containerId}`);
  
  await logger.info('Container started successfully', { containerId });
  return { containerId };
}

async function imageExists(imageTag: string): Promise<boolean> {
  try {
    await execCommand(`docker image inspect ${imageTag}`);
    return true;
  } catch (error) {
    logger.debug('Image not found', { imageTag });
    return false;
  }
}

async function recoverContainers(): Promise<void> {
  try {
    const interrupted = await cleanupStaleBuildingDeployments();
    if (interrupted.length > 0) {
      await logger.info('Marked interrupted deployments as failed', { count: interrupted.length });
    }

    const stale = await deduplicateActiveDeployments();
    if (stale.length > 0) {
      await logger.info('Cleaned up stale active deployments', { count: stale.length });
    }

    const orphaned = await cleanupOrphanedPreviewDeployments();
    if (orphaned.length > 0) {
      await logger.info('Cleaned up deployments for deleted preview branches', { count: orphaned.length });
    }

    const deployments = await getActiveDeployments();
    await logger.info('Recovering active containers...', { count: deployments.length });

    for (const deployment of deployments) {
      try {
        const previewBranch = deployment.is_preview
          ? deployment.preview_branch || deployment.deployment_branch
          : undefined;
        const routeDomain = deployment.is_preview
          ? deployment.preview_subdomain
          : deployment.domain;

        if (!routeDomain) {
          throw new Error(
            `No routing domain is configured for deployment ${deployment.deployment_id}`
          );
        }

        const reconcileContainerRoute = async (
          containerId: string,
          knownRoutingHostname?: string
        ): Promise<void> => {
          const routingHostname =
            knownRoutingHostname ??
            (await getContainerRoutingHostname(
              containerId,
              deployment.deployment_id
            ));

          await updateNginxConfig(
            deployment.name,
            routeDomain,
            routingHostname,
            previewBranch,
            deployment.deployment_id
          );
          await logger.info('Nginx route reconciled with Docker DNS', {
            name: deployment.name,
            domain: routeDomain,
            previewBranch,
            deploymentId: deployment.deployment_id,
            routingHostname,
          });
        };

        const exists = await containerExists(deployment.container_id);
        
        if (!exists) {
          const imageTag = `${deployment.name}:${deployment.version}`;
          const hasImage = await imageExists(imageTag);
          // Use the deployment's branch; fall back to the app's default branch
          const targetBranch = deployment.deployment_branch || deployment.branch || 'main';
          // DB credentials to pass as env vars during recovery
          const dbEnv: Record<string, string> = deployment.db_user ? {
            POSTGRES_USER: deployment.db_user,
            POSTGRES_PASSWORD: deployment.db_password,
            POSTGRES_DB: deployment.db_name,
            POSTGRES_HOST: 'postgres',
            BRANCH: targetBranch,
            DATABASE_URL: `postgres://${deployment.db_user}:${deployment.db_password}@postgres:5432/${deployment.db_name}`
          } : { BRANCH: targetBranch };

          if (hasImage) {
            await logger.info(`Container gone but image exists, starting new container`, {
              name: deployment.name,
              imageTag
            });

            const allEnv = await mergeAppEnv(deployment, targetBranch, dbEnv, {
              isPreview: targetBranch !== deployment.branch,
            });
            const envString = Object.entries(allEnv)
              .map(([key, value]) => `"-e${key}=${value}"`)
              .join(' ');

            const timestamp = new Date().getTime();
            const containerName = `${deployment.name}_${deployment.version}_${timestamp}`;

            const { containerId, routingHostname } = await startContainer(
              containerName,
              imageTag,
              networkName,
              envString,
              {
                networkAlias: getDeploymentNetworkAlias(
                  deployment.deployment_id
                ),
              }
            );

            await reconcileContainerRoute(containerId, routingHostname);

            await updateDeploymentContainer(deployment.container_id, containerId);

            await logger.info(`Successfully started new container from existing image`, {
              name: deployment.name,
              containerId
            });
          } else {
            await logger.info(`Container and image gone, performing full rebuild`, {
              name: deployment.name,
              containerId: deployment.container_id
            });

            const { containerId, routingHostname } = await buildAndStartContainer(
              deployment,
              deployment.version,
              dbEnv,
              deployment.deployment_id
            );

            await reconcileContainerRoute(containerId, routingHostname);

            await updateDeploymentContainer(deployment.container_id, containerId);
          }
          continue;
        }

        // If container exists, check its status
        const containerStatus = await execCommand(
          `docker inspect -f '{{.State.Status}}' ${deployment.container_id}`
        ).catch(error => {
          logger.debug('Container status check failed', { 
            error: error.message,
            containerId: deployment.container_id 
          });
          return null;
        }) as string | null;

        if (containerStatus && containerStatus.trim() !== 'running') {
          await logger.info(`Container exists but not running, attempting to recover`, { 
            name: deployment.name, 
            status: containerStatus.trim() 
          });
          
          // Double check after a delay to avoid race conditions with docker restart
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const retryStatus = await execCommand(
            `docker inspect -f '{{.State.Status}}' ${deployment.container_id}`
          ).catch(() => null) as string | null;

          if (!retryStatus || retryStatus.trim() !== 'running') {
            await startExistingContainer(deployment.container_id);
            await reconcileContainerRoute(deployment.container_id);

            await logger.info(`Successfully recovered existing container`, {
              name: deployment.name,
              containerId: deployment.container_id,
            });
          } else {
            await reconcileContainerRoute(deployment.container_id);
            await logger.info(`Container recovered on its own`, { 
              name: deployment.name,
              status: retryStatus.trim() 
            });
          }
        } else {
          await logger.info(`Container is running`, {
            name: deployment.name,
            status: containerStatus ? containerStatus.trim() : 'unknown'
          });

          await reconcileContainerRoute(deployment.container_id);
        }
      } catch (error) {
        await logger.error(`Failed to recover container`, { 
          name: deployment.name,
          error: (error as Error).message || 'Unknown error'
        } as any);
      }
    }
  } catch (error) {
    await logger.error('Container recovery failed', error as Error);
    throw error;
  }
}

async function deleteAppContainers(appName: string): Promise<void> {
  try {
    // Find all containers for this app (active and inactive)
    const containers = await execCommand(`docker ps -a --filter "name=${appName}" --format "{{.ID}}"`) as string;
    const containerIds = containers.trim().split('\n').filter(id => id);

    // Stop and remove each container
    for (const containerId of containerIds) {
      await execCommand(`docker stop ${containerId}`);
      await execCommand(`docker rm ${containerId}`);
    }
  } catch (error) {
    await logger.error(`Error deleting containers for ${appName}`, error as Error);
    throw error;
  }
}

async function getServicesHealth(): Promise<ServiceHealth[]> {
  // Use docker compose ps to get status of services containers: postgres, nginx, redis, imgproxy
  const containers = await execCommand(`docker compose ps --format "{{.ID}} {{.Name}} {{.Status}}"`) as string;
  
  // Split output into lines and parse each line
  const lines = containers.split('\n').filter(line => line.trim());
  
  const healthStatus: ServiceHealth[] = lines.map(line => {
    const [id, fullName, ...statusParts] = line.split(' ');
    // Extract service name from full container name (e.g., "port-au-next-nginx-1" -> "nginx")
    const service = fullName.split('-').slice(-2, -1)[0] as Service;
    
    // Parse status string to determine service status
    const statusString = statusParts.join(' ').toLowerCase();
    let status: ServiceStatus = 'unknown';
    
    if (statusString.includes('up') || statusString.includes('running')) {
      status = 'running';
    } else if (statusString.includes('exited') || statusString.includes('stopped')) {
      status = 'stopped';
    }
    
    return {
      id,
      name: fullName,
      status,
      service
    };
  }).filter(status => 
    // Only include our core services
    ['postgres', 'nginx', 'redis', 'minio', 'imgproxy', 'umami', 'bugsink'].includes(status.service)
  );

  return healthStatus;
}

export {
  buildAndStartContainer,
  buildReleaseImages,
  startContainer,
  stopContainer,
  waitForContainerRunning,
  waitForHealthyContainer,
  waitForContainerReady,
  recoverContainers,
  containerExists,
  deleteAppContainers,
  getServicesHealth,
  ensureDockerfile,
};
