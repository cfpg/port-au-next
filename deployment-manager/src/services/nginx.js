const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getContainerIp } = require('./docker');

// Use absolute path from project root
const NGINX_CONFIG_DIR = path.join(process.cwd(), './nginx/conf.d');

async function updateNginxConfig(appName, domain, containerId = null) {
  try {
    console.log(`Using nginx config directory: ${NGINX_CONFIG_DIR}`);
    
    // Ensure nginx config directory exists
    if (!fs.existsSync(NGINX_CONFIG_DIR)) {
      console.log(`Creating nginx config directory: ${NGINX_CONFIG_DIR}`);
      fs.mkdirSync(NGINX_CONFIG_DIR, { recursive: true });
    }
    
    const configPath = path.join(NGINX_CONFIG_DIR, `app-${domain}.conf`);
    let upstreamServer = 'deployment-manager:3000';

    if (containerId) {
      const containerIp = await getContainerIp(containerId);
      upstreamServer = `${containerIp}:3000`;
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

    console.log(`Writing nginx config to: ${configPath}`);
    fs.writeFileSync(configPath, config);
    await reloadNginx();
  } catch (error) {
    console.error(`Error updating nginx config: ${error.message}`);
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
          console.error(`Error reloading nginx: ${error.message}`);
          reject(error);
        } else {
          console.log('Nginx configuration reloaded successfully');
          resolve();
        }
      }
    );
  });
}

module.exports = {
  updateNginxConfig
}; 