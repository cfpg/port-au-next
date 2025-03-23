import { recoverContainers } from './services/docker';
import { configureSharedServices } from './services/nginx';
import { generateServiceCertificates } from './services/certbot';
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
      const certResults = await generateServiceCertificates();
      console.log('Service Certificate generation results:', certResults);
      
      // Configure nginx for shared services (HTTP or HTTPS based on certificate availability)
      await configureSharedServices();
      
      console.log('Startup tasks completed successfully');
    } catch (error) {
      console.error('Startup tasks failed:', error);
      throw error;
    }
  }
}