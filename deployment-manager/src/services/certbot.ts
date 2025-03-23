import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from '~/services/logger';

const execAsync = promisify(exec);

interface CertbotOptions {
  domain: string;
  email: string;
}

export async function generateCertificate({ domain, email }: CertbotOptions): Promise<void> {
  const projectRoot = path.join(process.cwd(), './');
  
  try {
    logger.info(`Generating SSL certificate for ${domain}...`);
    
    const command = `docker compose -p port-au-next exec -T certbot certbot certonly --webroot --webroot-path=/var/www/certbot --email ${email} -d ${domain} --agree-tos --non-interactive --force-renewal`;
    
    await execAsync(command, { cwd: projectRoot });
    
    logger.info(`SSL certificate generated successfully for ${domain}`);
  } catch (error) {
    logger.error(`Error generating SSL certificate for ${domain}:`, error as Error);
    throw error;
  }
}
