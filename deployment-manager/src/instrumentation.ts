import {
  markReady,
  markStarting,
  markStartupFailed,
  type ReadinessReason,
} from './lib/readiness';

async function runOptionalStep(
  name: string,
  operation: () => Promise<void> | void
): Promise<void> {
  const startedAt = Date.now();

  try {
    await operation();
    console.log(`${name} completed`);
  } catch (error) {
    console.warn(`${name} deferred`, {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    async function runOptionalStartup(): Promise<void> {
      const { ensureNginxConfigMount } = await import('./services/nginx');

      await runOptionalStep('Nginx config mount check', ensureNginxConfigMount);

      await runOptionalStep('Log retention scheduling', async () => {
        const { scheduleLogRetentionCleanup } = await import('./lib/logRetention');
        scheduleLogRetentionCleanup();
      });

      await runOptionalStep('Deployment manager vhost setup', async () => {
        const { setupDeploymentManager } = await import('./lib/startup');
        await setupDeploymentManager();
      });

      await runOptionalStep('Minio setup', async () => {
        const { setupMinio } = await import('./lib/startup');
        await setupMinio();
      });

      await runOptionalStep('Imgproxy setup', async () => {
        const { setupImgproxy } = await import('./lib/startup');
        await setupImgproxy();
      });

      await runOptionalStep('port-schedule vhost setup', async () => {
        const { setupPortSchedule } = await import('./lib/startup');
        await setupPortSchedule();
      });

      await runOptionalStep('Umami database bootstrap', async () => {
        const { ensureUmamiDatabase } = await import('./services/umamiDb');
        await ensureUmamiDatabase();
      });

      await runOptionalStep('Bugsink database bootstrap', async () => {
        const { ensureBugsinkDatabase } = await import('./services/bugsinkDb');
        await ensureBugsinkDatabase();
      });

      await runOptionalStep('Umami platform admin bootstrap', async () => {
        const { ensureUmamiPlatformAdmin } = await import('./services/umami');
        await ensureUmamiPlatformAdmin();
      });

      await runOptionalStep('Bugsink platform bootstrap', async () => {
        const { ensureBugsinkPlatformReady } = await import('./services/bugsink');
        await ensureBugsinkPlatformReady();
      });

      await runOptionalStep('Umami vhost setup', async () => {
        const { setupUmami } = await import('./lib/startup');
        await setupUmami();
      });

      await runOptionalStep('Bugsink vhost setup', async () => {
        const { setupBugsink } = await import('./lib/startup');
        await setupBugsink();
      });

      await runOptionalStep('Container recovery', async () => {
        const { recoverContainers } = await import('./services/docker');
        await recoverContainers();
      });

      await runOptionalStep('Platform service Cloudflare route sync', async () => {
        const { syncPlatformServicesOnStartup } = await import(
          './services/cloudflarePlatformServices'
        );
        await syncPlatformServicesOnStartup();
      });
    }

    const startedAt = Date.now();
    markStarting();
    let failureReason: Exclude<ReadinessReason, 'initializing' | 'ready'> =
      'migration_failed';

    try {
      const { migrate } = await import('./queries/migrate');
      await migrate();
      console.log('Database migrations completed');

      failureReason = 'critical_startup_failed';
      const { ensureAdminUser } = await import('./lib/startup');
      await ensureAdminUser();
      console.log('Admin user setup completed');

      markReady();
      console.log('Deployment manager readiness changed', {
        ready: true,
        reason: 'ready',
        durationMs: Date.now() - startedAt,
      });

      void runOptionalStartup().catch((error) => {
        console.warn('Optional startup reconciliation stopped unexpectedly', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } catch (error) {
      markStartupFailed(failureReason);
      console.error('Critical error during startup:', error);
      process.exit(1);
    }
  }
}
