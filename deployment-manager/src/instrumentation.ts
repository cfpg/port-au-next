export async function register() {
  // Only run in Node.js runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminUser } = await import('./lib/startup');
    const { setupMinio } = await import('./lib/startup');
    const { setupImgproxy } = await import('./lib/startup');
    const { setupPortSchedule } = await import('./lib/startup');
    const { setupUmami } = await import('./lib/startup');
    const { ensureUmamiDatabase } = await import('./services/umamiDb');
    const { migrate } = await import('./queries/migrate');
    const { scheduleLogRetentionCleanup } = await import('./lib/logRetention');
    const { ensureNginxAppsLogRoot } = await import('./lib/nginxLogs');
    
    try {
      // Run database migrations
      await migrate();
      console.log('Database migrations completed');

      scheduleLogRetentionCleanup();
      console.log('Log retention cleanup scheduled');

      // Ensure admin user exists on startup
      await ensureAdminUser();
      console.log('Admin user setup completed');

      // Setup Minio configuration
      await setupMinio();
      console.log('Minio setup completed');

      // Setup Imgproxy configuration
      await setupImgproxy();
      console.log('Imgproxy setup completed');

      // Optional: nginx vhost for public port-schedule hostname
      await setupPortSchedule();
      console.log('port-schedule vhost step finished (no vhost if PORT_SCHEDULE_HOST unset)');

      await ensureUmamiDatabase();
      console.log('Umami database bootstrap finished');

      await setupUmami();
      console.log('Umami vhost step finished (no vhost if UMAMI_HOST unset)');

      await ensureNginxAppsLogRoot();
      console.log('Nginx apps log directory permissions configured');

      const { recoverContainers } = await import('./services/docker');

      // Recover any containers that are not running
      await recoverContainers();
      console.log('Container recovery completed');
    } catch (error) {
      console.error('Error during startup:', error);
      process.exit(1);
    }
  }
} 