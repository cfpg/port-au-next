import fs from 'fs';
import path from 'path';
import logger from '~/services/logger';
import { execCommand } from '~/utils/docker';
import {
  execCompose,
  getComposeServiceContainerId,
  waitForComposeService,
} from '~/utils/compose';
import getAppsDir from '~/utils/getAppsDir';
import {
  getNginxContainerAccessLogPath,
  getNginxContainerErrorLogPath,
} from '~/lib/logPaths';
import { ensureNginxDeploymentLogDir } from '~/lib/nginxLogs';
import { assertDockerDnsName } from '~/lib/deploymentRouting';

const NGINX_CONFIG_DIR = path.join(getAppsDir(), '../nginx/conf.d');
const DEFAULT_APP_CLIENT_MAX_BODY_SIZE = '10M';
const NGINX_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];

export type NginxApplyResult =
  | { status: 'applied' }
  | { status: 'deferred'; reason: string }
  | { status: 'rejected'; reason: string };

let nginxApplyInFlight: Promise<NginxApplyResult> | null = null;
let nginxRetryTimer: ReturnType<typeof setTimeout> | null = null;
let nginxRetryAttempt = 0;
let configMutationTail: Promise<void> = Promise.resolve();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNginxValidationError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('nginx: [emerg]') ||
    (message.includes('configuration file') && message.includes('test failed')) ||
    message.includes('syntax is invalid')
  );
}

function clearNginxRetry(): void {
  if (nginxRetryTimer) {
    clearTimeout(nginxRetryTimer);
    nginxRetryTimer = null;
  }
  nginxRetryAttempt = 0;
}

function scheduleNginxRetry(reason: string): void {
  if (nginxRetryTimer) {
    return;
  }

  const delayMs =
    NGINX_RETRY_DELAYS_MS[
      Math.min(nginxRetryAttempt, NGINX_RETRY_DELAYS_MS.length - 1)
    ];
  nginxRetryAttempt += 1;

  void logger.warning('nginx config apply deferred', {
    reason,
    retryAttempt: nginxRetryAttempt,
    nextRetryMs: delayMs,
  });

  nginxRetryTimer = setTimeout(() => {
    nginxRetryTimer = null;
    void reloadNginx();
  }, delayMs);
  nginxRetryTimer.unref?.();
}

function atomicWriteConfig(configPath: string, content: string): void {
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, configPath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function restoreConfig(configPath: string, previousContent: string | null): void {
  if (previousContent === null) {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    return;
  }

  atomicWriteConfig(configPath, previousContent);
}

function queueConfigMutation<T>(operation: () => Promise<T>): Promise<T> {
  const queued = configMutationTail.then(operation, operation);
  configMutationTail = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

async function applyConfigMutation(
  configPath: string,
  renderNextContent: () => string | null,
  options: { rollbackOnDeferred?: boolean } = {}
): Promise<NginxApplyResult> {
  return queueConfigMutation(async () => {
    const previousContent = fs.existsSync(configPath)
      ? fs.readFileSync(configPath, 'utf8')
      : null;
    const nextContent = renderNextContent();

    if (nextContent === null) {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    } else {
      atomicWriteConfig(configPath, nextContent);
    }

    const result = await reloadNginx(true);
    const shouldRollback =
      result.status === 'rejected' ||
      (options.rollbackOnDeferred && result.status === 'deferred');
    if (!shouldRollback) {
      return result;
    }

    restoreConfig(configPath, previousContent);
    const rollbackResult = await reloadNginx(true);
    if (rollbackResult.status === 'rejected') {
      throw new Error(
        `nginx rejected the new configuration and rollback validation failed: ${rollbackResult.reason}`
      );
    }

    if (result.status === 'rejected') {
      throw new Error(`nginx rejected the new configuration: ${result.reason}`);
    }

    return result;
  });
}

async function waitForNginxContainer(): Promise<boolean> {
  const containerId = await waitForComposeService('nginx');
  return containerId !== null;
}

async function execInNginxContainer(shellCommand: string): Promise<string> {
  const nginxContainerId = await getComposeServiceContainerId('nginx');
  if (!nginxContainerId) {
    throw new Error('nginx container not found');
  }

  const quotedCommand = `'${shellCommand.replace(/'/g, `'\\''`)}'`;
  return execCommand(
    `docker exec ${nginxContainerId} sh -c ${quotedCommand}`
  ) as Promise<string>;
}

async function isNginxConfigMountBroken(): Promise<boolean> {
  const hostConfigCount = fs
    .readdirSync(NGINX_CONFIG_DIR)
    .filter((file) => file.endsWith('.conf')).length;

  if (hostConfigCount === 0) {
    return false;
  }

  let containerConfigCount = 0;
  try {
    const output = await execInNginxContainer(
      'find /etc/nginx/conf.d -maxdepth 1 -type f -name "*.conf" 2>/dev/null | wc -l'
    );
    containerConfigCount = Number.parseInt(output.trim(), 10);
  } catch (error) {
    await logger.debug('could not count nginx configs inside container; skipping mount check', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  if (!Number.isFinite(containerConfigCount) || containerConfigCount === 0) {
    return true;
  }

  if (containerConfigCount < hostConfigCount) {
    return true;
  }

  try {
    const mountInfo = await execInNginxContainer(
      "mount | grep -F '/etc/nginx/conf.d' || true"
    );
    if (mountInfo.includes('type tmpfs')) {
      return true;
    }
  } catch {
    // Non-fatal: config count already matched the host.
  }

  return false;
}

async function ensureNginxConfigMount(): Promise<void> {
  const hostConfigCount = fs
    .readdirSync(NGINX_CONFIG_DIR)
    .filter((file) => file.endsWith('.conf')).length;

  if (hostConfigCount === 0) {
    await logger.debug('no nginx configs on host yet; skipping mount check');
    return;
  }

  const nginxRunning = await waitForNginxContainer();
  if (!nginxRunning) {
    await logger.warning('nginx container not running yet; skipping config mount check');
    return;
  }

  if (!(await isNginxConfigMountBroken())) {
    await logger.debug('nginx config bind mount looks healthy');
    return;
  }

  await logger.warning(
    'nginx conf.d bind mount is missing or empty inside the container; recreating nginx'
  );

  try {
    // --no-deps: nginx depends_on deployment-manager; without this, compose can
    // recreate deployment-manager from inside this container and kill startup.
    await execCompose('up -d --force-recreate --no-deps nginx');

    const recreateDelaysMs = [2000, 4000, 6000, 8000, 10000];
    for (const delayMs of recreateDelaysMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      if (!(await isNginxConfigMountBroken())) {
        await logger.info('nginx container recreated and config bind mount restored');
        return;
      }
    }

    await logger.warning(
      'nginx config bind mount still looks broken after recreate; continuing startup (check host ./nginx/conf.d bind mount)'
    );
  } catch (error) {
    await logger.warning('Failed to recreate nginx container during config mount check', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const getCommonNginxConfig = (
  domain: string,
  upstreamServer: string,
  appName: string,
  deploymentId: number
) => {
  const accessLog = getNginxContainerAccessLogPath(appName, deploymentId);
  const errorLog = getNginxContainerErrorLogPath(appName, deploymentId);

  return `
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    resolver 127.0.0.11 valid=1s ipv6=off;
    resolver_timeout 2s;
    set $deployment_upstream ${upstreamServer};

    client_max_body_size ${DEFAULT_APP_CLIENT_MAX_BODY_SIZE};

    access_log ${accessLog} combined;
    error_log ${errorLog} warn;
    
    # Increase proxy response buffer sizes
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    proxy_max_temp_file_size 0;
    
    # Cache settings for static files, images and Next.js image optimization
    location ~* (\\.(jpg|jpeg|png|gif|ico|webp|svg|woff2|woff|ttf|mp4)$|/_next/image\\?) {
        proxy_pass http://$deployment_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Remove existing Cache-Control header from upstream
        proxy_hide_header Cache-Control;

        # Enable caching
        proxy_cache_use_stale error timeout http_500 http_502 http_503 http_504;
        proxy_cache_valid 200 31d;
        expires 31d;
        add_header Cache-Control "public, no-transform, max-age=2678400";
        
        # Optional: Add a cache identifier in response headers
        add_header X-Cache-Status $upstream_cache_status;
    }
    
    location / {
        proxy_pass http://$deployment_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
};

const getBranchMarkers = (branch: string) => ({
  start: `# START PREVIEW BRANCH === ${branch} ===`,
  end: `# END PREVIEW BRANCH === ${branch} ===`
});

const getPreviewBranchConfig = (
  branch: string,
  domain: string,
  upstreamServer: string,
  appName: string,
  deploymentId: number
) => {
  const markers = getBranchMarkers(branch);
  return `
${markers.start}
${getCommonNginxConfig(domain, upstreamServer, appName, deploymentId)}
${markers.end}
`;
};

async function updateNginxConfig(
  appName: string,
  domain: string,
  routingHostname: string,
  previewBranch?: string,
  deploymentId?: number,
  options: { requireApplied?: boolean } = {}
): Promise<NginxApplyResult> {
  try {
    await logger.info(`Using nginx config directory: ${NGINX_CONFIG_DIR}`);
    
    if (!fs.existsSync(NGINX_CONFIG_DIR)) {
      await logger.info(`Creating nginx config directory: ${NGINX_CONFIG_DIR}`);
      fs.mkdirSync(NGINX_CONFIG_DIR, { recursive: true });
    }

    if (deploymentId !== undefined) {
      await ensureNginxDeploymentLogDir(appName, deploymentId);
    }

    const upstreamServer = `${assertDockerDnsName(routingHostname)}:3000`;
    let configPath: string;

    if (previewBranch) {
      if (deploymentId === undefined) {
        throw new Error('deploymentId is required for preview branch nginx config');
      }

      configPath = path.join(NGINX_CONFIG_DIR, `preview-${appName}.conf`);
      const applyResult = await applyConfigMutation(
        configPath,
        () => {
          let existingConfig = fs.existsSync(configPath)
            ? fs.readFileSync(configPath, 'utf8')
            : '';

          const markers = getBranchMarkers(previewBranch);
          const startIndex = existingConfig.indexOf(markers.start);
          const endIndex = existingConfig.indexOf(markers.end);

          if (startIndex !== -1 && endIndex !== -1) {
            existingConfig =
              existingConfig.substring(0, startIndex) +
              existingConfig.substring(endIndex + markers.end.length);
          }

          const branchConfig = getPreviewBranchConfig(
            previewBranch,
            domain,
            upstreamServer,
            appName,
            deploymentId
          );

          return (existingConfig + branchConfig).trim() + '\n';
        },
        { rollbackOnDeferred: options.requireApplied }
      );
      await logger.info('Nginx desired configuration updated', {
        configPath,
        applyStatus: applyResult.status,
        routingHostname,
      });
      return applyResult;
    } else {
      if (deploymentId === undefined) {
        throw new Error('deploymentId is required for production nginx config');
      }

      configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
      const config = getCommonNginxConfig(domain, upstreamServer, appName, deploymentId);
      const applyResult = await applyConfigMutation(configPath, () => config, {
        rollbackOnDeferred: options.requireApplied,
      });
      await logger.info('Nginx desired configuration updated', {
        configPath,
        applyStatus: applyResult.status,
        routingHostname,
      });
      return applyResult;
    }
  } catch (error) {
    await logger.error(`Error updating nginx config`, error as Error);
    throw error;
  }
}

async function validateNginxConfigurationInOneOffContainer(): Promise<NginxApplyResult | null> {
  try {
    await execCompose('run --rm --no-deps nginx nginx -t');
    return null;
  } catch (error) {
    if (isNginxValidationError(error)) {
      return { status: 'rejected', reason: errorMessage(error) };
    }

    return { status: 'deferred', reason: errorMessage(error) };
  }
}

async function applyNginxConfiguration(
  validateWhenStopped: boolean
): Promise<NginxApplyResult> {
  let nginxContainerId: string | null;
  try {
    nginxContainerId = await getComposeServiceContainerId('nginx');
  } catch (error) {
    return { status: 'deferred', reason: errorMessage(error) };
  }

  if (!nginxContainerId) {
    if (validateWhenStopped) {
      const validationResult = await validateNginxConfigurationInOneOffContainer();
      if (validationResult) {
        return validationResult;
      }
    }

    return { status: 'deferred', reason: 'nginx container is not running' };
  }

  try {
    await execCompose('exec -T nginx nginx -t');
  } catch (error) {
    if (isNginxValidationError(error)) {
      return { status: 'rejected', reason: errorMessage(error) };
    }

    return { status: 'deferred', reason: errorMessage(error) };
  }

  try {
    await execCompose('exec -T nginx nginx -s reload');
    return { status: 'applied' };
  } catch (error) {
    return { status: 'deferred', reason: errorMessage(error) };
  }
}

async function reloadNginx(validateWhenStopped = false): Promise<NginxApplyResult> {
  if (nginxApplyInFlight) {
    const inFlightResult = await nginxApplyInFlight;
    if (validateWhenStopped && inFlightResult.status === 'deferred') {
      return reloadNginx(true);
    }
    return inFlightResult;
  }

  nginxApplyInFlight = (async () => {
    const result = await applyNginxConfiguration(validateWhenStopped);

    if (result.status === 'applied') {
      const recoveredAfterAttempts = nginxRetryAttempt;
      clearNginxRetry();
      await logger.info('Nginx configuration applied', {
        recoveredAfterAttempts,
      });
    } else if (result.status === 'deferred') {
      scheduleNginxRetry(result.reason);
    } else {
      clearNginxRetry();
      await logger.warning('Nginx configuration rejected', {
        reason: result.reason,
      });
    }

    return result;
  })().finally(() => {
    nginxApplyInFlight = null;
  });

  return nginxApplyInFlight;
}

async function deleteAppConfig(domain: string) {
  try {
    if (!domain || domain.includes('/') || domain.includes('..')) {
      throw new Error('Invalid domain name');
    }

    const configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
    
    if (!configPath.startsWith(NGINX_CONFIG_DIR)) {
      throw new Error('Invalid nginx config path');
    }
    
    if (fs.existsSync(configPath)) {
      await logger.info(`Found nginx config at ${configPath}, deleting...`);
      const applyResult = await applyConfigMutation(configPath, () => null);
      await logger.info('Nginx desired configuration removed', {
        configPath,
        applyStatus: applyResult.status,
      });
    } else {
      await logger.info(`No nginx config found at ${configPath}, skipping deletion`);
    }
    return true;
  } catch (error) {
    await logger.error(`Error deleting nginx config`, error as Error);
    throw error;
  }
}

async function deletePreviewBranchConfig(appName: string, branch: string) {
  try {
    const configPath = path.join(NGINX_CONFIG_DIR, `preview-${appName}.conf`);
    
    if (fs.existsSync(configPath)) {
      const applyResult = await applyConfigMutation(configPath, () => {
        let config = fs.readFileSync(configPath, 'utf8');
        const markers = getBranchMarkers(branch);
        const startIndex = config.indexOf(markers.start);
        const endIndex = config.indexOf(markers.end);

        if (startIndex === -1 || endIndex === -1) {
          return config;
        }

        config =
          config.substring(0, startIndex) +
          config.substring(endIndex + markers.end.length);
        const trimmedConfig = config.trim();
        return trimmedConfig ? `${trimmedConfig}\n` : null;
      });

      await logger.info(`Removed nginx config for preview branch ${branch}`, {
        applyStatus: applyResult.status,
      });
    }
  } catch (error) {
    await logger.error(`Error deleting preview branch nginx config`, error as Error);
    throw error;
  }
}

interface LocationConfig {
  path: string;
  proxyPass: string;
  allowCors?: boolean;
  resolveAtRuntime?: boolean;
}

interface ServiceVhostOptions {
  clientMaxBodySize?: string;
  /**
   * How nginx sets X-Forwarded-Proto for the upstream app.
   * - scheme: $scheme (default; http when nginx listens on :80)
   * - https: always https (public HTTPS-only hostnames)
   * - honor-upstream: $http_x_forwarded_proto, falling back to https
   */
  forwardedProto?: 'scheme' | 'https' | 'honor-upstream';
}

function getForwardedProtoLines(forwardedProto: ServiceVhostOptions['forwardedProto']): string {
  switch (forwardedProto) {
    case 'https':
      return '        proxy_set_header X-Forwarded-Proto https;';
    case 'honor-upstream':
      return `        set $forwarded_proto $http_x_forwarded_proto;
        if ($forwarded_proto = "") {
            set $forwarded_proto "https";
        }
        proxy_set_header X-Forwarded-Proto $forwarded_proto;`;
    case 'scheme':
    default:
      return '        proxy_set_header X-Forwarded-Proto $scheme;';
  }
}

function getProxyPassLines(
  serviceName: string,
  location: LocationConfig,
  index: number
): string {
  if (!location.resolveAtRuntime) {
    return `        proxy_pass ${location.proxyPass};`;
  }

  const target = new URL(location.proxyPass);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error(`Unsupported proxy protocol for ${serviceName}`);
  }
  if (target.pathname !== '/' || target.search || target.hash) {
    throw new Error(`Runtime-resolved proxy target for ${serviceName} must not contain a URI`);
  }

  const variableName = `${serviceName.replace(/[^a-zA-Z0-9_]/g, '_')}_upstream_${index}`;
  return `        resolver 127.0.0.11 valid=1s ipv6=off;
        resolver_timeout 2s;
        set $${variableName} ${target.host};
        proxy_pass ${target.protocol}//$${variableName};`;
}

async function createServiceVhostConfig(
  serviceName: string,
  serverName: string,
  locations: LocationConfig[],
  options: ServiceVhostOptions = {}
): Promise<void> {
  try {
    const configPath = path.join(NGINX_CONFIG_DIR, `service-${serviceName}.conf`);
    
    const clientMaxBodySize = options.clientMaxBodySize || '5M';
    const forwardedProtoLines = getForwardedProtoLines(options.forwardedProto);
    
    const locationBlocks = locations.map((loc, index) => {
      const proxyPassLines = getProxyPassLines(serviceName, loc, index);
      const baseConfig = `
    # ${serviceName} ${loc.path === '/' ? 'API' : loc.path}
    location ${loc.path} {
${proxyPassLines}
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
${forwardedProtoLines}
        proxy_connect_timeout 300;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        chunked_transfer_encoding off;
        client_max_body_size ${clientMaxBodySize};`;

      if (loc.allowCors) {
        return `${baseConfig}
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        add_header 'Access-Control-Expose-Headers' 'Content-Length,Content-Range' always;
    }`;
      }

      return `${baseConfig}
    }`;
    }).join('\n');

    const config = `
server {
    listen 80;
    server_name ${serverName};
    client_max_body_size ${clientMaxBodySize};
${locationBlocks}
}`;

    const applyResult = await applyConfigMutation(configPath, () => config);
    await logger.info(`Created nginx config for service ${serviceName}`, {
      applyStatus: applyResult.status,
    });
  } catch (error) {
    await logger.error(`Error creating nginx config for service ${serviceName}`, error as Error);
    throw error;
  }
}

export {
  ensureNginxConfigMount,
  updateNginxConfig,
  reloadNginx,
  deleteAppConfig,
  deletePreviewBranchConfig,
  createServiceVhostConfig,
};
