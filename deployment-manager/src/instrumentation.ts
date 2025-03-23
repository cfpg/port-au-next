import { recoverContainers } from './services/docker';
import { configureNginxForBetterAuth } from './services/nginx';
import { generateCertificates } from './services/certbot';
import dbMigrate from './scripts/migrate';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      console.log('Running startup tasks...');
      
      // Run database migrations
      await dbMigrate();
      
      // Recover any existing containers
      await recoverContainers();
      
      // Generate SSL certificates if needed
      const certResults = await generateCertificates();
      console.log('Certificate generation results:', certResults);
      
      // Configure nginx for better-auth (HTTP or HTTPS based on certificate availability)
      await configureNginxForBetterAuth();
      
      console.log('Startup tasks completed successfully');
    } catch (error) {
      console.error('Startup tasks failed:', error);
      throw error;
    }
  }
}