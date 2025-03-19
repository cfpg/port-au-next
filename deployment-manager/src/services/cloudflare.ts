import Cloudflare from 'cloudflare';
import { exec } from 'child_process';
import path from 'path';
import logger from '~/services/logger';
import getAppsDir from '~/utils/getAppsDir';

const APPS_DIR = getAppsDir();

class CloudflareService {
  private cf!: Cloudflare;
  public enabled: boolean;

  constructor() {
    if (process.env.CLOUDFLARE_API_EMAIL && process.env.CLOUDFLARE_API_KEY) {
      this.cf = new Cloudflare({
        apiEmail: process.env.CLOUDFLARE_API_EMAIL,
        apiKey: process.env.CLOUDFLARE_API_KEY,
      });
      this.enabled = true;
    } else {
      this.enabled = false;
      logger.info('Cloudflare integration is disabled - missing credentials');
    }
  }

  async getChangedAssets(appName: string, oldCommit: string, newCommit: string) {
    if (!this.enabled) return [];
    
    const appDir = path.join(APPS_DIR, appName);
    
    return new Promise<string[]>((resolve, reject) => {
      // Use git diff with pathspec to only show specific file types
      exec(
        `cd ${appDir} && git diff --name-only ${oldCommit} ${newCommit} -- '*.jpg' '*.png' '*.gif' '*.svg' '*.webp' '*.ttf' '*.woff' '*.woff2' '*.mp4'`,
        (error: Error | null, stdout: string) => {
          if (error) {
            reject(error);
            return;
          }

          // Filter out empty lines and remove the /public prefix
          const changedFiles = stdout.split('\n').filter(file => file.replace("/public", "").trim());
          resolve(changedFiles);
        }
      );
    });
  }

  async purgeCache(domain: string, zoneId: string, files: string[]) {
    if (!this.enabled) {
      await logger.info('Cloudflare integration is not enabled, skipping cache purge.');
      return null;
    };

    try {
      if (!files.length || !zoneId) {
        await logger.info('No files to purge or zone ID not found, skipping cache purge.');
        return null;
      }

      // Convert file paths to URLs
      const urls = files.map(file => `https://${domain}/${file}`);

      await logger.info('Purging Cloudflare cache', { domain, zoneId, urls });

      await this.cf.cache.purge({
        zone_id: zoneId,
        files: urls
      }).catch(async (err: typeof Cloudflare.APIError) => {
        if (err instanceof Cloudflare.APIError) {
          await logger.error('Cloudflare API Error', {
            status: err.status,
            name: err.name,
            headers: err.headers
          } as Error & { code?: string; status?: string; headers?: any });
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

  // Helper method to fetch zone ID for a domain
  async getZoneId(domain: string) {
    if (!this.enabled) {
      await logger.info('Cloudflare integration is not enabled, skipping zone ID fetch.');
      return null;
    };

    try {
      const zones = await this.cf.zones.list({
        name: domain,
        status: 'active',
        match: 'all'
      }).catch(async (err: typeof Cloudflare.APIError) => {
        if (err instanceof Cloudflare.APIError) {
          await logger.error('Cloudflare API Error', {
            code: err.status,
            name: err.name,
            headers: err.headers
          } as Error & { code?: string; status?: string; headers?: any });
          throw err;
        }
        throw err;
      });

      // The list method returns a paginated result
      const zone = zones.result[0];
      return zone ? zone.id : null;
    } catch (error) {
      await logger.error('Failed to fetch Cloudflare zone ID', error as Error);
      throw error;
    }
  }
}

export default new CloudflareService(); 