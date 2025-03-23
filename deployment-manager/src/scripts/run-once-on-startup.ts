import dbMigrate from './migrate';
import setupServiceCertificates from './generateCertificates';
import { configureNginxForBetterAuth } from './nginx';

async function runStartupTasks() {
  try {
    // Run database migrations
    await dbMigrate();

    // Generate SSL certificates for shared services
    await setupServiceCertificates();

    // Configure nginx for better-auth service
    await configureNginxForBetterAuth();

    console.log('All startup tasks completed successfully');
  } catch (error) {
    console.error('Startup tasks failed:', error);
    throw error;
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runStartupTasks()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { runStartupTasks }; 