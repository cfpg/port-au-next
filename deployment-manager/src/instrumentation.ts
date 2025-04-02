export async function register() {
  // Only run in Node.js runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminUser } = await import('./lib/startup');
    const { migrate } = await import('./services/database');
    
    try {
      // Run database migrations
      await migrate();
      console.log('Database migrations completed');

      // Ensure admin user exists on startup
      await ensureAdminUser();
      console.log('Admin user setup completed');
    } catch (error) {
      console.error('Error during startup:', error);
      process.exit(1);
    }
  }
} 