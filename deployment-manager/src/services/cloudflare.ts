import 'cloudflare/shims/web';
import Cloudflare from 'cloudflare';
import { exec } from 'child_process';
import path from 'path';
import logger from '~/services/logger';
import getAppsDir from '~/utils/getAppsDir';
import { getCloudflareCredentials } from '~/services/cloudflareClient';
import { normalizeHostname } from '~/utils/cloudflareHostname';

const APPS_DIR = getAppsDir();

class CloudflareService {
  public enabled: boolean;

  constructor() {
    this.enabled = Boolean(
      process.env.CLOUDFLARE_API_KEY || process.env.CLOUDFLARE_ACCOUNT_ID
    );
  }

  private async getClient(): Promise<Cloudflare | null> {
    const credentials = await getCloudflareCredentials();
    if (credentials) {
      this.enabled = true;
      return credentials.client;
    }

    const apiKey = process.env.CLOUDFLARE_API_KEY?.trim();
    const apiEmail = process.env.CLOUDFLARE_API_EMAIL?.trim();
    if (apiKey && apiEmail) {
      this.enabled = true;
      return new Cloudflare({ apiEmail, apiKey });
    }

    this.enabled = false;
    return null;
  }

  async getChangedAssets(appName: string, oldCommit: string, newCommit: string) {
    const client = await this.getClient();
    if (!client) return [];

    const appDir = path.join(APPS_DIR, appName);

    return new Promise<string[]>((resolve, reject) => {
      exec(
        `cd ${appDir} && git diff --name-only ${oldCommit} ${newCommit} -- '*.jpg' '*.png' '*.gif' '*.svg' '*.webp' '*.ttf' '*.woff' '*.woff2' '*.mp4'`,
        (error: Error | null, stdout: string) => {
          if (error) {
            reject(error);
            return;
          }

          const changedFiles = stdout
            .split('\n')
            .filter((file) => file.replace('/public', '').trim());
          resolve(changedFiles);
        }
      );
    });
  }

  async purgeCache(domain: string, zoneId: string, files: string[]) {
    const client = await this.getClient();
    if (!client) {
      await logger.info('Cloudflare integration is not enabled, skipping cache purge.');
      return null;
    }

    try {
      if (!files.length || !zoneId) {
        await logger.info('No files to purge or zone ID not found, skipping cache purge.');
        return null;
      }

      const urls = files.map((file) => `https://${domain}/${file}`);

      await logger.info('Purging Cloudflare cache', { domain, zoneId, urls });

      await client.cache.purge({ zone_id: zoneId, files: urls }).catch(async (err) => {
        if (err instanceof Cloudflare.APIError) {
          await logger.error('Cloudflare API Error', {
            status: err.status,
            name: err.name,
            headers: err.headers,
          } as Error & { code?: string; status?: string; headers?: unknown });
          throw err;
        }
        throw err;
      });

      await logger.info('Successfully purged Cloudflare cache');
    } catch (error) {
      await logger.error('Failed to purge Cloudflare cache', error as Error);
      throw error;
    }
  }

  async getZoneId(domain: string) {
    const client = await this.getClient();
    if (!client) {
      await logger.info('Cloudflare integration is not enabled, skipping zone ID fetch.');
      return null;
    }

    try {
      const normalized = normalizeHostname(domain);
      const zones = await client.zones.list({
        name: normalized,
        status: 'active',
        match: 'all',
      });

      const zone = zones.result[0];
      return zone ? zone.id : null;
    } catch (error) {
      await logger.error('Failed to fetch Cloudflare zone ID', error as Error);
      throw error;
    }
  }

  async getZoneIdForHostname(hostname: string) {
    const credentials = await getCloudflareCredentials();
    if (!credentials) return null;

    const zones: Array<{ id: string; name: string; status?: string }> = [];
    for await (const zone of credentials.client.zones.list({
      account: { id: credentials.accountId },
      per_page: 50,
    })) {
      zones.push({ id: zone.id, name: zone.name, status: zone.status });
    }

    const { resolveZoneForHostname } = await import('~/utils/cloudflareHostname');
    const resolved = resolveZoneForHostname(hostname, zones);
    return resolved?.status === 'active' ? resolved.zoneId : null;
  }
}

export default new CloudflareService();
