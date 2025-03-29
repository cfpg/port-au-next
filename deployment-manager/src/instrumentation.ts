export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Import the database migration code dynamically
    const { dbMigrate } = await import('./services/database');
    
    try {
      console.log('Running startup tasks...');
      
      // Run database migrations
      await dbMigrate();
      
      // Configure BetterAuth for deployment manager
      const { configureBetterAuthForDeploymentManager } = await import('./services/betterAuth');
      await configureBetterAuthForDeploymentManager();
      
      // Recover any existing containers
      const { recoverContainers } = await import('./services/docker');
      await recoverContainers();
      
      // Generate SSL certificates if needed
      const { generateServiceCertificates } = await import('./services/certbot');
      const certResults = await generateServiceCertificates();
      console.log('Service Certificate generation results:', certResults);
      
      // Configure nginx for shared services
      const { configureSharedServices } = await import('./services/nginx');
      await configureSharedServices();
      
      console.log('Startup tasks completed successfully');
    } catch (error) {
      console.error('Startup tasks failed:', error);
      throw error;
    }
  }
}