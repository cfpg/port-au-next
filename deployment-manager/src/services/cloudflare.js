const Cloudflare = require('cloudflare');
const { exec } = require('child_process');
const path = require('path');
const logger = require('./logger');

class CloudflareService {
  constructor() {
    if (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY) {
      this.cf = new Cloudflare({
        apiEmail: process.env.CLOUDFLARE_EMAIL,
        apiKey: process.env.CLOUDFLARE_API_KEY,
      });
      this.enabled = true;
    } else {
      this.enabled = false;
      logger.info('Cloudflare integration is disabled - missing credentials');
    }
  }

  async getChangedAssets(appName, oldCommit, newCommit) {
    if (!this.enabled) return [];
    
    const appDir = path.join(process.env.HOST_APPS_DIR || '/app/apps', appName);
    
    return new Promise((resolve, reject) => {
      // Use git diff with pathspec to only show specific file types
      exec(
        `cd ${appDir} && git diff --name-only ${oldCommit} ${newCommit} -- '*.jpg' '*.png' '*.gif' '*.svg' '*.webp' '*.ttf' '*.woff' '*.woff2' '*.mp4'`,
        (error, stdout) => {
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

  async purgeCache(domain, zoneId, files) {
    if (!this.enabled) return;

    try {
      if (!files.length || !zoneId) {
        return;
      }

      // Convert file paths to URLs
      const urls = files.map(file => `https://${domain}/${file}`);

      await logger.info('Purging Cloudflare cache', { domain, zoneId, urls });

      await this.cf.cache.purge({
        zone_id: zoneId,
        files: urls
      }).catch(async (err) => {
        if (err instanceof Cloudflare.APIError) {
          await logger.error('Cloudflare API Error', {
            status: err.status,
            name: err.name,
            headers: err.headers
          });
          throw err;
        }
        throw err;
      });

      await logger.info('Successfully purged Cloudflare cache');
    } catch (error) {
      await logger.error('Failed to purge Cloudflare cache', { domain, zoneId }, error);
      throw error;
    }
  }

  // Helper method to fetch zone ID for a domain
  async getZoneId(domain) {
    if (!this.enabled) return null;

    try {
      const zones = await this.cf.zones.list({
        name: domain,
        status: 'active',
        match: 'all'
      }).catch(async (err) => {
        if (err instanceof Cloudflare.APIError) {
          await logger.error('Cloudflare API Error', {
            status: err.status,
            name: err.name,
            headers: err.headers
          });
          throw err;
        }
        throw err;
      });

      // The list method returns a paginated result
      const zone = zones.result[0];
      return zone ? zone.id : null;
    } catch (error) {
      await logger.error('Failed to fetch Cloudflare zone ID', { domain }, error);
      throw error;
    }
  }
}

module.exports = new CloudflareService(); 