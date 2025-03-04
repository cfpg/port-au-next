const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { getContainerIp } = require('./docker');

const NGINX_CONFIG_DIR = path.join(__dirname, '../../../nginx/conf.d');

async function updateNginxConfig(appName, domain, containerId = null) {
  const configPath = path.join(NGINX_CONFIG_DIR, `${domain}.conf`);
  let upstreamServer = 'deployment-manager:3000'; // Default during initial setup

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

  fs.writeFileSync(configPath, config);
  await reloadNginx();
}

async function reloadNginx() {
  return new Promise((resolve, reject) => {
    exec('docker exec nginx nginx -s reload', (error) => {
      if (error) {
        // Fallback to docker-compose if direct docker exec fails
        exec('docker-compose exec -T nginx nginx -s reload', (error2) => {
          if (error2) {
            console.error('Failed to reload nginx:', error2);
            reject(error2);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  updateNginxConfig,
  reloadNginx
}; 