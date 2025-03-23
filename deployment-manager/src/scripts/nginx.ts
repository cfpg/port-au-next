import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function configureNginxForBetterAuth() {
  const authHost = process.env.BETTER_AUTH_HOST;
  if (!authHost) {
    console.log('No auth host provided, skipping nginx configuration.');
    return;
  }

  const nginxConfigPath = path.join(__dirname, '..', 'nginx', 'conf.d', 'auth.conf');
  
  const config = `
server {
    listen 80;
    server_name ${authHost};
    
    # Let's Encrypt challenge location
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${authHost};

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/${authHost}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${authHost}/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/${authHost}/chain.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Logging
    access_log /var/log/nginx/auth.access.log combined buffer=512k flush=1m;
    error_log /var/log/nginx/auth.error.log warn;

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
    await fs.writeFile(nginxConfigPath, config);
    console.log('Nginx configuration updated successfully');

    // Reload nginx configuration
    await execAsync('docker compose -p port-au-next exec -T nginx nginx -s reload');
    console.log('Nginx configuration reloaded successfully');
  } catch (error) {
    console.error('Error configuring nginx:', error);
    throw error;
  }
}

