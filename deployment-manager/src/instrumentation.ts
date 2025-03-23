import { recoverContainers } from './services/docker';
import { configureNginxForBetterAuth } from './services/nginx';
import dbMigrate from './scripts/migrate';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      console.log('Running startup tasks...');
      
      // Run database migrations
      await dbMigrate();
      
      // Recover any existing containers
      await recoverContainers();
      
      // Configure nginx for better-auth (HTTP only for now)
      await configureNginxForBetterAuth();
      
      console.log('Startup tasks completed successfully');
    } catch (error) {
      console.error('Startup tasks failed:', error);
      throw error;
    }
  }
}