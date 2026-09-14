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

      // Container recovery and deploy-queue recovery are NOT run through runOptionalStep:
      // that helper swallows errors so later steps still run, but the deploy queue must
      // only start processing jobs once both of these have genuinely completed - reaching
      // this point in the step list is not the same guarantee. See deployQueue.ts's
      // markSystemReady()/kick(), which are no-ops until this succeeds.
      const recoveryStartedAt = Date.now();
      try {
        const { recoverContainers } = await import('./services/docker');
        await recoverContainers();

        const { reconcileInterruptedJobs, markSystemReady } = await import('./services/deployQueue');
        await reconcileInterruptedJobs();

        markSystemReady();
        console.log('Container and deploy-queue recovery completed', {
          durationMs: Date.now() - recoveryStartedAt,
        });
      } catch (error) {
        console.warn(
          'Container/deploy-queue recovery failed - auto-deploy and queued manual deploys will not run until the next successful restart',
          {
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - recoveryStartedAt,
          }
        );
      }

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
