import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import logger from '~/services/logger';
import { getContainerIp, execCommand } from '~/utils/docker';
import getAppsDir from '~/utils/getAppsDir';
import util from 'util';

const execAsync = util.promisify(exec);

// Use absolute path from project root
const NGINX_CONFIG_DIR = path.join(getAppsDir(), '../nginx/conf.d');

export async function configureNginxForBetterAuth() {
  const authHost = process.env.BETTER_AUTH_HOST;
  if (!authHost) {
    logger.info('No auth host provided, skipping nginx configuration.');
    return;
  }

  const nginxConfigPath = path.join(NGINX_CONFIG_DIR, 'service-auth.conf');
  
  const config = `
server {
    listen 80;
    server_name ${authHost};
    
    # Let's Encrypt challenge location
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Better Auth service
    location / {
        proxy_pass http://better-auth:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;

  try {
    await fs.promises.writeFile(nginxConfigPath, config);
    logger.info('Nginx configuration updated successfully');

    // Reload nginx configuration
    await execAsync('docker compose -p port-au-next exec -T nginx nginx -s reload');
    logger.info('Nginx configuration reloaded successfully');
  } catch (error) {
    logger.error('Error configuring nginx:', error as Error);
    throw error;
  }
}

export async function updateNginxConfig(appName: string, domain: string, containerId: string | null = null) {
  try {
    await logger.info(`Using nginx config directory: ${NGINX_CONFIG_DIR}`);
    
    // Ensure nginx config directory exists
    if (!fs.existsSync(NGINX_CONFIG_DIR)) {
      await logger.info(`Creating nginx config directory: ${NGINX_CONFIG_DIR}`);
      fs.mkdirSync(NGINX_CONFIG_DIR, { recursive: true });
    }
    
    const configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
    let upstreamServer = 'deployment-manager:3000';

    if (containerId) {
      await logger.debug('Getting container IP', { containerId });
      const containerIp = await getContainerIp(containerId);
      upstreamServer = `${containerIp}:3000`;
      await logger.debug('Using container IP for upstream', { containerIp });
    }

    const config = `
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    
    # Increase buffer size settings
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    proxy_max_temp_file_size 0;
    
    # Cache settings for static files, images and Next.js image optimization
    location ~* (\.(jpg|jpeg|png|gif|ico|webp|svg|woff2|woff|ttf|mp4)$|/_next/image\?) {
        proxy_pass http://${upstreamServer};
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
        proxy_pass http://${upstreamServer};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

    await logger.info(`Writing nginx config to: ${configPath}`);
    fs.writeFileSync(configPath, config);
    await reloadNginx();
    await logger.info('Nginx configuration updated successfully');
  } catch (error) {
    await logger.error(`Error updating nginx config`, error as Error);
    throw error;
  }
}

export async function reloadNginx() {
  const projectRoot = path.join(process.cwd(), './');
  
  return new Promise<void>((resolve, reject) => {
    exec(
      'docker compose -p port-au-next exec -T nginx nginx -s reload',
      { cwd: projectRoot },
      (error: Error | null) => {
        if (error) {
          logger.error(`Error reloading nginx`, error);
          reject(error);
        } else {
          logger.info('Nginx configuration reloaded successfully');
          resolve();
        }
      }
    );
  });
}

export async function deleteAppConfig(domain: string) {
  try {
    // Validate domain doesn't contain path traversal attempts
    if (!domain || domain.includes('/') || domain.includes('..')) {
      throw new Error('Invalid domain name');
    }

    const configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
    
    // Ensure the path is still within NGINX_CONFIG_DIR after joining
    if (!configPath.startsWith(NGINX_CONFIG_DIR)) {
      throw new Error('Invalid nginx config path');
    }
    
    // Check if config exists before trying to delete
    if (fs.existsSync(configPath)) {
      await logger.info(`Found nginx config at ${configPath}, deleting...`);
      // Use promises version for better async handling
      await fs.promises.unlink(configPath);
      
      // Verify nginx config before reloading
      try {
        // Test nginx configuration first
        await execCommand('nginx -t');
        // Only reload if test passes
        await reloadNginx();
        await logger.info('Nginx configuration reloaded successfully');
      } catch (nginxError) {
        await logger.error('Failed to reload nginx after config deletion', nginxError as Error);
        // Still consider deletion successful since file is gone
      }
    } else {
      await logger.info(`No nginx config found at ${configPath}, skipping deletion`);
    }
    return true; // Success either way for idempotency
  } catch (error) {
    await logger.error(`Error deleting nginx config`, error as Error);
    throw error;
  }
}
