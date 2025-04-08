export async function register() {
  // Only run in Node.js runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminUser } = await import('./lib/startup');
    const { setupMinio } = await import('./lib/startup');
    const { setupImgproxy } = await import('./lib/startup');
    const { migrate } = await import('./queries/migrate');
    
    try {
      // Run database migrations
      await migrate();
      console.log('Database migrations completed');

      // Ensure admin user exists on startup
      await ensureAdminUser();
      console.log('Admin user setup completed');

      // Setup Minio configuration
      await setupMinio();
      console.log('Minio setup completed');

      // Setup Imgproxy configuration
      await setupImgproxy();
      console.log('Imgproxy setup completed');
    } catch (error) {
      console.error('Error during startup:', error);
      process.exit(1);
    }
  }
} 