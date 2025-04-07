import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import logger from '~/services/logger';
import { getContainerIp, execCommand } from '~/utils/docker';
import getAppsDir from '~/utils/getAppsDir';

// Use absolute path from project root
const NGINX_CONFIG_DIR = path.join(getAppsDir(), '../nginx/conf.d');

// Common nginx configuration blocks
const getCommonNginxConfig = (domain: string, upstreamServer: string) => `
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
}`;

// Preview branch markers
const getBranchMarkers = (branch: string) => ({
  start: `# START PREVIEW BRANCH === ${branch} ===`,
  end: `# END PREVIEW BRANCH === ${branch} ===`
});

// Get preview branch configuration with markers
const getPreviewBranchConfig = (branch: string, domain: string, upstreamServer: string) => {
  const markers = getBranchMarkers(branch);
  return `
${markers.start}
${getCommonNginxConfig(`${branch}.${domain}`, upstreamServer)}
${markers.end}
`;
};

async function updateNginxConfig(
  appName: string, 
  domain: string, 
  containerId: string | null = null,
  previewBranch?: string
) {
  try {
    await logger.info(`Using nginx config directory: ${NGINX_CONFIG_DIR}`);
    
    // Ensure nginx config directory exists
    if (!fs.existsSync(NGINX_CONFIG_DIR)) {
      await logger.info(`Creating nginx config directory: ${NGINX_CONFIG_DIR}`);
      fs.mkdirSync(NGINX_CONFIG_DIR, { recursive: true });
    }

    let configPath: string;
    let upstreamServer = 'deployment-manager:3000';

    if (containerId) {
      await logger.debug('Getting container IP', { containerId });
      const containerIp = await getContainerIp(containerId);
      upstreamServer = `${containerIp}:3000`;
      await logger.debug('Using container IP for upstream', { containerIp });
    }

    if (previewBranch) {
      // For preview branches, use a separate config file
      configPath = path.join(NGINX_CONFIG_DIR, `preview-${appName}.conf`);

      // Create or update the preview branch configuration
      let existingConfig = '';
      if (fs.existsSync(configPath)) {
        existingConfig = fs.readFileSync(configPath, 'utf8');
      }

      // Remove existing configuration for this branch if it exists
      const markers = getBranchMarkers(previewBranch);
      const startIndex = existingConfig.indexOf(markers.start);
      const endIndex = existingConfig.indexOf(markers.end);

      if (startIndex !== -1 && endIndex !== -1) {
        existingConfig = existingConfig.substring(0, startIndex) + 
                        existingConfig.substring(endIndex + markers.end.length);
      }

      // Create new configuration for this branch
      const branchConfig = getPreviewBranchConfig(previewBranch, domain, upstreamServer);

      // Append new configuration
      fs.writeFileSync(configPath, (existingConfig + branchConfig).trim() + '\n');
    } else {
      // For main branch, use the standard config file
      configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
      const config = getCommonNginxConfig(domain, upstreamServer);
      fs.writeFileSync(configPath, config);
    }

    await logger.info(`Writing nginx config to: ${configPath}`);
    await reloadNginx();
    await logger.info('Nginx configuration updated successfully');
  } catch (error) {
    await logger.error(`Error updating nginx config`, error as Error);
    throw error;
  }
}

async function reloadNginx() {
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

async function deleteAppConfig(domain: string) {
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

async function deletePreviewBranchConfig(appName: string, branch: string) {
  try {
    const configPath = path.join(NGINX_CONFIG_DIR, `preview-${appName}.conf`);
    
    if (fs.existsSync(configPath)) {
      let config = fs.readFileSync(configPath, 'utf8');
      
      const markers = getBranchMarkers(branch);
      const startIndex = config.indexOf(markers.start);
      const endIndex = config.indexOf(markers.end);

      if (startIndex !== -1 && endIndex !== -1) {
        // Remove the branch configuration
        config = config.substring(0, startIndex) + 
                config.substring(endIndex + markers.end.length);
        
        // Write back the config file
        fs.writeFileSync(configPath, config.trim() + '\n');
        
        // If the file is empty (except for whitespace), delete it
        if (!config.trim()) {
          fs.unlinkSync(configPath);
        }
        
        await reloadNginx();
        await logger.info(`Removed nginx config for preview branch ${branch}`);
      }
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
}

interface ServiceVhostOptions {
  clientMaxBodySize?: string;
}

async function createServiceVhostConfig(
  serviceName: string,
  serverName: string,
  locations: LocationConfig[],
  options: ServiceVhostOptions = {}
): Promise<void> {
  try {
    const configPath = path.join(NGINX_CONFIG_DIR, `service-${serviceName}.conf`);
    
    // Set default client_max_body_size if not provided
    const clientMaxBodySize = options.clientMaxBodySize || '5M';
    
    // Generate location blocks from the locations array
    const locationBlocks = locations.map(loc => {
      const baseConfig = `
    # ${serviceName} ${loc.path === '/' ? 'API' : loc.path}
    location ${loc.path} {
        proxy_pass ${loc.proxyPass};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        chunked_transfer_encoding off;
        client_max_body_size ${clientMaxBodySize};`;

      // Add CORS headers if enabled
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

    fs.writeFileSync(configPath, config);
    await reloadNginx();
    await logger.info(`Created nginx config for service ${serviceName}`);
  } catch (error) {
    await logger.error(`Error creating nginx config for service ${serviceName}`, error as Error);
    throw error;
  }
}

export {
  updateNginxConfig,
  reloadNginx,
  deleteAppConfig,
  deletePreviewBranchConfig,
  createServiceVhostConfig,
};
