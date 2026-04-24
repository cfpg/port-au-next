import Fastify from 'fastify';
import { loadAppConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './migrate.js';
import { createTenantAuth } from './auth/tenant.js';
import { createAdminAuth } from './auth/admin.js';
import { registerJobsRoutes } from './routes/jobsRoutes.js';
import { registerAdminRoutes } from './routes/adminRoutes.js';
import { startScheduler } from './scheduler/tick.js';

const log = {
  info: (m: string, o?: object) => console.log(m, o ?? ''),
  error: (m: string, e?: unknown) => console.error(m, e),
};

async function main() {
  const cfg = loadAppConfig();
  const pool = createPool(cfg.connectionString);

  if (cfg.migrateOnStart) {
    log.info('port-schedule: running migrations (MIGRATE_ON_START=true)');
    await runMigrations(pool);
  } else {
    log.info('port-schedule: skipping migrations (set MIGRATE_ON_START=true or run npm run migrate)');
  }

  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ ok: true, service: 'port-schedule' }));

  await app.register(async (adminScope) => {
    adminScope.addHook('preHandler', createAdminAuth(cfg.masterApiKey));
    await registerAdminRoutes(adminScope, pool);
  });

  await app.register(
    async (v1) => {
      v1.addHook('preHandler', createTenantAuth(pool));
      await registerJobsRoutes(v1, pool);
    },
    { prefix: '/v1' }
  );

  const stopScheduler = startScheduler(pool, log);

  await app.listen({ port: cfg.port, host: '0.0.0.0' });
  log.info(`port-schedule listening on :${cfg.port}`);

  const shutdown = async () => {
    stopScheduler();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
