const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getContainerIp } = require('./docker');
const logger = require('./logger');

// Use absolute path from project root
const NGINX_CONFIG_DIR = path.join(process.cwd(), './nginx/conf.d');

async function updateNginxConfig(appName, domain, containerId = null) {
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
    await logger.error(`Error updating nginx config`, error);
    throw error;
  }
}

async function reloadNginx() {
  const projectRoot = path.join(process.cwd(), './');
  
  return new Promise((resolve, reject) => {
    exec(
      'docker compose -p port-au-next exec -T nginx nginx -s reload',
      { cwd: projectRoot },
      (error) => {
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

module.exports = {
  updateNginxConfig
}; 