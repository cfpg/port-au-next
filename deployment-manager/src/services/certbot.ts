import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from '~/services/logger';

const execAsync = promisify(exec);

interface CertbotOptions {
  domain: string;
  email: string;
  staging?: boolean;
}

interface CertificateResult {
  domain: string;
  success: boolean;
  error?: string;
}

export async function verifyCertificatesExist(domain: string): Promise<boolean> {
  try {
    const requiredFiles = [
      'fullchain.pem',
      'privkey.pem',
      'chain.pem'
    ];

    const domainPath = path.join('/etc/letsencrypt/live', domain);
    const command = `docker compose -p port-au-next exec -T nginx sh -c 'ls ${domainPath}'`;
    
    const { stdout } = await execAsync(command);
    
    // If ls returns "No such file or directory", the directory doesn't exist
    if (stdout.includes('No such file or directory')) {
      logger.debug(`Certificate directory not found for domain: ${domain}`);
      return false;
    }

    // Split the output into lines and check if all required files exist
    const files = stdout.split('\n').filter(Boolean); // filter(Boolean) removes empty lines
    const hasAllFiles = requiredFiles.every(file => files.includes(file));
    
    if (!hasAllFiles) {
      logger.debug(`Missing some certificate files for domain: ${domain}`);
      return false;
    }

    logger.debug(`All certificate files verified for domain: ${domain}`);
    return true;
  } catch (error) {
    logger.error(`Error verifying certificates for ${domain}:`, error as Error);
    return false;
  }
}

export async function generateCertificate({ domain, email, staging = false }: CertbotOptions): Promise<CertificateResult> {
  try {
    // First check if certificates already exist
    const certificatesExist = await verifyCertificatesExist(domain);
    if (certificatesExist) {
      logger.info(`Certificates already exist for ${domain}, skipping generation`);
      return { domain, success: true };
    }

    const stagingFlag = staging ? '--staging' : '';
    
    logger.info(`Generating SSL certificate for ${domain}...`);
    
    const command = `docker compose -p port-au-next exec nginx certbot certonly \
      ${stagingFlag} \
      --webroot \
      --webroot-path=/var/www/certbot \
      --non-interactive \
      --agree-tos \
      -v \
      --email ${email} \
      --domains ${domain} \
      --cert-name ${domain}`;
    
    logger.debug('Running certbot command:', { command });
    
    try {
      const { stdout, stderr } = await execAsync(command);
      logger.debug('Certbot output:', { stdout, stderr });
      logger.info(`Certificate generated successfully for ${domain}`);
    } catch (execError) {
      // Log the full error details including stderr
      const error = execError as { stderr?: string, stdout?: string, name?: string, message?: string };
      logger.error('Certbot command failed:', {
        stdout: error.stdout,
        stderr: error.stderr,
        name: error.name || 'Unknown',
        message: error.message || 'Unknown error',
      });
      throw execError;
    }

    // Verify certificates were generated successfully
    const certificatesGenerated = await verifyCertificatesExist(domain);
    if (!certificatesGenerated) {
      throw new Error('Certificate files were not generated successfully');
    }

    return { domain, success: true };
  } catch (error) {
    logger.error(`Failed to generate certificate for ${domain}:`, error as Error);
    return { 
      domain, 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function generateServiceCertificates(): Promise<CertificateResult[]> {
  if (!process.env.CERTBOT_EMAIL) {
    logger.info('No email provided, skipping certificate generation.');
    return [];
  }

  // Add required services here or add optional services using conditional env var logic
  const services = [];

  if (process.env.DEPLOYMENT_MANAGER_HOST) {
    logger.info("Generating certificate for deployment-manager...");
    services.push({
      domain: process.env.DEPLOYMENT_MANAGER_HOST,
      staging: process.env.NODE_ENV !== 'production'
    });
  }

  if (process.env.BETTER_AUTH_HOST) {
    logger.info("Generating certificate for better-auth...");
    services.push({
      domain: process.env.BETTER_AUTH_HOST,
      staging: process.env.NODE_ENV !== 'production'
    });
  }

  if (!services.length) {
    logger.info('No services to generate certificates for, skipping.');
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
