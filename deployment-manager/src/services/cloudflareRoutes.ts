import logger from '~/services/logger';
import cloudflare from '~/services/cloudflare';
import cloudflareTunnel from '~/services/cloudflareTunnel';
import { isCloudflareConnected } from '~/services/cloudflareClient';
import { getPreviewWildcardHostname } from '~/utils/cloudflareHostname';
import type { CloudflareRouteSourceType } from '~/queries/cloudflareHostnameRoutesQuery';
import pool from '~/services/database';

export async function syncAppDomainRoute(
  appId: number,
  hostname: string | null | undefined,
  previousHostname?: string | null
): Promise<{ success: boolean; error?: string; zoneId?: string }> {
  if (!(await isCloudflareConnected())) {
    return { success: true };
  }

  if (previousHostname && previousHostname !== hostname) {
    try {
      await cloudflareTunnel.removePublishedApplication(previousHostname);
    } catch (error) {
      await logger.warning('Failed to remove previous Cloudflare route', {
        error: (error as Error).message,
      });
    }
  }

  if (!hostname) {
    return { success: true };
  }

  try {
    const result = await cloudflareTunnel.addPublishedApplication({
      hostname,
      sourceType: 'app',
      sourceId: String(appId),
    });

    await pool.query('UPDATE apps SET cloudflare_zone_id = $1 WHERE id = $2', [
      result.zoneId,
      appId,
    ]);

    return { success: true, zoneId: result.zoneId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync Cloudflare route';
    await logger.error('Failed to sync app domain route', error as Error);
    return { success: false, error: message };
  }
}

export async function syncPreviewWildcardRoute(
  appId: number,
  previewDomain: string | null | undefined,
  previousPreviewDomain?: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!(await isCloudflareConnected())) {
    return { success: true };
  }

  if (previousPreviewDomain && previousPreviewDomain !== previewDomain) {
    try {
      await cloudflareTunnel.removePublishedApplication(
        getPreviewWildcardHostname(previousPreviewDomain)
      );
    } catch (error) {
      await logger.warning('Failed to remove previous preview wildcard route', {
        error: (error as Error).message,
      });
    }
  }

  if (!previewDomain) {
    return { success: true };
  }

  try {
    await cloudflareTunnel.addPublishedApplication({
      hostname: getPreviewWildcardHostname(previewDomain),
      sourceType: 'preview_wildcard',
      sourceId: String(appId),
    });
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to sync preview wildcard route';
    await logger.error('Failed to sync preview wildcard route', error as Error);
    return { success: false, error: message };
  }
}

export async function syncServiceHostnameRoute(
  hostname: string,
  serviceName: string
): Promise<{ success: boolean; error?: string }> {
  if (!(await isCloudflareConnected())) {
    return { success: true };
  }

  try {
    await cloudflareTunnel.addPublishedApplication({
      hostname,
      sourceType: 'service',
      sourceId: serviceName,
    });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync service route';
    await logger.error('Failed to sync service hostname route', error as Error);
    return { success: false, error: message };
  }
}

export async function removeAppCloudflareRoutes(
  appId: number,
  domain?: string | null,
  previewDomain?: string | null
): Promise<void> {
  if (domain) {
    try {
      await cloudflareTunnel.removePublishedApplication(domain);
    } catch (error) {
      await logger.warning('Failed to remove app domain route', {
        error: (error as Error).message,
      });
    }
  }

  if (previewDomain) {
    try {
      await cloudflareTunnel.removePublishedApplication(
        getPreviewWildcardHostname(previewDomain)
      );
    } catch (error) {
      await logger.warning('Failed to remove preview wildcard route', {
        error: (error as Error).message,
      });
    }
  }

  void appId;
}

export async function resolveZoneIdForAppDomain(
  domain: string
): Promise<string | null> {
  if (!(await isCloudflareConnected())) {
    return cloudflare.getZoneId(domain);
  }

  return cloudflare.getZoneIdForHostname(domain);
}

export type { CloudflareRouteSourceType };
