export async function register() {
  // Only run in Node.js runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminUser } = await import('./lib/startup');
    
    // Ensure admin user exists on startup
    await ensureAdminUser();
  }
} 