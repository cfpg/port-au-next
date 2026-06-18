import {
  PLATFORM_SERVICE_HOSTS,
  getPlatformServiceDefinition,
  getPlatformServiceHostname,
  type PlatformServiceId,
} from '~/constants/platformServiceHosts';
import {
  buildHostnameStatus,
  type CloudflareReadiness,
  type HostnameCloudflareStatus,
} from '~/services/cloudflareAppStatus';
import { getCloudflareCredentials } from '~/services/cloudflareClient';
import {
  syncAllPlatformServiceRoutes,
  syncPlatformServiceRoute,
} from '~/services/cloudflareRoutes';
import logger from '~/services/logger';

export interface PlatformServiceCloudflareStatus {
  id: PlatformServiceId;
  label: string;
  envKey: string;
  required: boolean;
  hostname: HostnameCloudflareStatus;
}

export interface PlatformServicesCloudflareOverview {
  readiness: CloudflareReadiness;
  readinessLabel: string;
  tunnelId: string | null;
  tunnelName: string | null;
  tunnelOriginUrl: string | null;
  services: PlatformServiceCloudflareStatus[];
}

function getReadinessLabel(readiness: CloudflareReadiness): string {
  switch (readiness) {
    case 'not_connected':
      return 'Cloudflare not connected';
    case 'no_tunnel':
      return 'No tunnel selected';
    case 'ready':
      return 'Ready';
  }
}

export async function getPlatformServicesCloudflareStatus(): Promise<PlatformServicesCloudflareOverview> {
  const credentials = await getCloudflareCredentials();
  let readiness: CloudflareReadiness = 'not_connected';
  if (credentials) {
    readiness = credentials.tunnelId ? 'ready' : 'no_tunnel';
  }

  const services: PlatformServiceCloudflareStatus[] = [];

  for (const definition of PLATFORM_SERVICE_HOSTS) {
    const hostnameValue = getPlatformServiceHostname(definition.id);
    const hostnameStatus = await buildHostnameStatus(
      hostnameValue,
      readiness,
      credentials?.tunnelId ?? null,
      credentials?.tunnelOriginUrl ?? null
    );

    services.push({
      id: definition.id,
      label: definition.label,
      envKey: definition.envKey,
      required: definition.required,
      hostname: hostnameStatus,
    });
  }

  return {
    readiness,
    readinessLabel: getReadinessLabel(readiness),
    tunnelId: credentials?.tunnelId ?? null,
    tunnelName: credentials?.tunnelName ?? null,
    tunnelOriginUrl: credentials?.tunnelOriginUrl ?? null,
    services,
  };
}

export async function syncPlatformService(serviceId: string): Promise<{
  success: boolean;
  error?: string;
  status?: PlatformServicesCloudflareOverview;
}> {
  const definition = getPlatformServiceDefinition(serviceId);
  if (!definition) {
    return { success: false, error: 'Unknown platform service' };
  }

  const result = await syncPlatformServiceRoute(definition.id as PlatformServiceId);
  const status = await getPlatformServicesCloudflareStatus();

  return {
    success: result.success,
    error: result.error,
    status,
  };
}

export async function syncAllPlatformServices(): Promise<{
  success: boolean;
  errors: string[];
  status: PlatformServicesCloudflareOverview;
}> {
  const result = await syncAllPlatformServiceRoutes();
  const status = await getPlatformServicesCloudflareStatus();
  const errors = result.results
    .filter((entry) => !entry.success && entry.error)
    .map((entry) => `${entry.serviceId}: ${entry.error}`);

  return {
    success: result.success,
    errors,
    status,
  };
}

export async function syncPlatformServicesOnStartup(): Promise<void> {
  try {
    const result = await syncAllPlatformServiceRoutes();
    if (result.results.length === 0) {
      return;
    }

    const synced = result.results.filter((entry) => entry.success).map((entry) => entry.serviceId);
    const failed = result.results.filter((entry) => !entry.success);

    if (synced.length > 0) {
      await logger.info('Platform service Cloudflare routes synced on startup', {
        services: synced,
      });
    }

    for (const entry of failed) {
      await logger.warning('Platform service Cloudflare route sync failed on startup', {
        serviceId: entry.serviceId,
        error: entry.error,
      });
    }
  } catch (error) {
    await logger.warning('Platform service Cloudflare sync skipped on startup', {
      error: (error as Error).message,
    });
  }
}
