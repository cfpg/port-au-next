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

interface CertificateResult {
  domain: string;
  success: boolean;
  error?: string;
}

async function generateCertificate(config: CertificateConfig): Promise<CertificateResult> {
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

    return { domain, success: true };
  } catch (error) {
    console.error(`Failed to generate certificate for ${domain}:`, error);
    return { 
      domain, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function generateCertificates(): Promise<CertificateResult[]> {
  if (!process.env.CERTBOT_EMAIL) {
    console.log('No email provided, skipping certificate generation.');
    return [];
  }

  // Add required services here or add optional services using conditional env var logic
  const services = [];

  if (process.env.BETTER_AUTH_HOST) {
    console.log("Generating certificate for better-auth...");
    services.push({
      domain: process.env.BETTER_AUTH_HOST,
      staging: process.env.NODE_ENV !== 'production'
    });
  }

  if (!services.length) {
    console.log('No services to generate certificates for, skipping.');
    return [];
  }

  // Use Promise.all to generate certificates in parallel
  const results = await Promise.all(
    services.map(service => 
      generateCertificate({
        domain: service.domain,
        email: process.env.CERTBOT_EMAIL!,
        staging: service.staging
      })
    )
  );

  return results;
}
