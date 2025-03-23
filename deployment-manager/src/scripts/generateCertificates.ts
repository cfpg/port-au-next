import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);

interface CertificateConfig {
  domain: string;
  email: string;
  staging?: boolean;
}

async function generateCertificate(config: CertificateConfig) {
  const { domain, email, staging = false } = config;
  const certPath = path.join('/app/nginx/ssl', domain);

  try {
    // Ensure SSL directory exists
    await fs.promises.mkdir(certPath, { recursive: true });

    const stagingFlag = staging ? '--staging' : '';
    
    // Use webroot challenge method
    const command = `docker compose -p port-au-next run --rm certbot certonly \
      ${stagingFlag} \
      --webroot \
      --webroot-path=/var/www/certbot \
      --non-interactive \
      --agree-tos \
      --email ${email} \
      --domains ${domain} \
      --cert-name ${domain}`;

    console.log(`Generating certificate for ${domain}...`);
    await execAsync(command);
    console.log(`Certificate generated successfully for ${domain}`);

    // Verify certificate files exist
    const requiredFiles = [
      path.join('/app/nginx/ssl/live', domain, 'fullchain.pem'),
      path.join('/app/nginx/ssl/live', domain, 'privkey.pem'),
      path.join('/app/nginx/ssl/live', domain, 'chain.pem')
    ];

    for (const file of requiredFiles) {
      try {
        await fs.promises.access(file);
        console.log(`Verified certificate file exists: ${file}`);
      } catch (error) {
        throw new Error(`Certificate file not found: ${file}`);
      }
    }

  } catch (error) {
    console.error(`Failed to generate certificate for ${domain}:`, error);
    throw error;
  }
}

async function generateSharedServiceCertificates() {
  if (!process.env.CLOUDFLARE_API_EMAIL) {
    console.log('No email provided, skipping certificate generation.');
    return;
  }

  // Add required services here or add optional services using conditional env var logic
  const services = [];

  if (process.env.BETTER_AUTH_HOST) {
    console.log("Generating certificate for better-auth...");
    services.push({
      domain: process.env.BETTER_AUTH_HOST,
      staging: false
    });
  }

  if (!services.length) {
    console.log('No services to generate certificates for, skipping.');
    return;
  }

  for (const service of services) {
    await generateCertificate({
      domain: service.domain,
      email: process.env.CLOUDFLARE_API_EMAIL,
      staging: service.staging
    });
  }
}

export default generateSharedServiceCertificates;
