import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import logger from '~/services/logger';
import { getContainerIp, execCommand } from '~/utils/docker';
import getAppsDir from '~/utils/getAppsDir';
import {
  ensureNginxDeploymentLogDir,
  getNginxContainerAccessLogPath,
  getNginxContainerErrorLogPath,
} from '~/lib/logPaths';

const NGINX_CONFIG_DIR = path.join(getAppsDir(), '../nginx/conf.d');

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

    access_log ${accessLog} combined;
    error_log ${errorLog} warn;
    
    # Increase buffer size settings
    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;
    proxy_max_temp_file_size 0;
    
    # Cache settings for static files, images and Next.js image optimization
    location ~* (\\.(jpg|jpeg|png|gif|ico|webp|svg|woff2|woff|ttf|mp4)$|/_next/image\\?) {
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
${getCommonNginxConfig(`${branch}.${domain}`, upstreamServer, appName, deploymentId)}
${markers.end}
`;
};

async function updateNginxConfig(
  appName: string, 
  domain: string, 
  containerId: string | null = null,
  previewBranch?: string,
  deploymentId?: number
) {
  try {
    await logger.info(`Using nginx config directory: ${NGINX_CONFIG_DIR}`);
    
    if (!fs.existsSync(NGINX_CONFIG_DIR)) {
      await logger.info(`Creating nginx config directory: ${NGINX_CONFIG_DIR}`);
      fs.mkdirSync(NGINX_CONFIG_DIR, { recursive: true });
    }

    if (deploymentId !== undefined) {
      ensureNginxDeploymentLogDir(appName, deploymentId);
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
      if (deploymentId === undefined) {
        throw new Error('deploymentId is required for preview branch nginx config');
      }

      configPath = path.join(NGINX_CONFIG_DIR, `preview-${appName}.conf`);

      let existingConfig = '';
      if (fs.existsSync(configPath)) {
        existingConfig = fs.readFileSync(configPath, 'utf8');
      }

      const markers = getBranchMarkers(previewBranch);
      const startIndex = existingConfig.indexOf(markers.start);
      const endIndex = existingConfig.indexOf(markers.end);

      if (startIndex !== -1 && endIndex !== -1) {
        existingConfig = existingConfig.substring(0, startIndex) + 
                        existingConfig.substring(endIndex + markers.end.length);
      }

      const branchConfig = getPreviewBranchConfig(
        previewBranch,
        domain,
        upstreamServer,
        appName,
        deploymentId
      );

      fs.writeFileSync(configPath, (existingConfig + branchConfig).trim() + '\n');
    } else {
      if (deploymentId === undefined) {
        throw new Error('deploymentId is required for production nginx config');
      }

      configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
      const config = getCommonNginxConfig(domain, upstreamServer, appName, deploymentId);
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
    if (!domain || domain.includes('/') || domain.includes('..')) {
      throw new Error('Invalid domain name');
    }

    const configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
    
    if (!configPath.startsWith(NGINX_CONFIG_DIR)) {
      throw new Error('Invalid nginx config path');
    }
    
    if (fs.existsSync(configPath)) {
      await logger.info(`Found nginx config at ${configPath}, deleting...`);
      await fs.promises.unlink(configPath);
      
      try {
        await execCommand('nginx -t');
        await reloadNginx();
        await logger.info('Nginx configuration reloaded successfully');
      } catch (nginxError) {
        await logger.error('Failed to reload nginx after config deletion', nginxError as Error);
      }
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
      let config = fs.readFileSync(configPath, 'utf8');
      
      const markers = getBranchMarkers(branch);
      const startIndex = config.indexOf(markers.start);
      const endIndex = config.indexOf(markers.end);

      if (startIndex !== -1 && endIndex !== -1) {
        config = config.substring(0, startIndex) + 
                config.substring(endIndex + markers.end.length);
        
        fs.writeFileSync(configPath, config.trim() + '\n');
        
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
    
    const clientMaxBodySize = options.clientMaxBodySize || '5M';
    
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
