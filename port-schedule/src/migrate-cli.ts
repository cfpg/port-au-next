import { createPool } from './db/pool.js';
import { loadDbConfig } from './config.js';
import { runMigrations } from './migrate.js';

async function main() {
  const cfg = loadDbConfig();
  const pool = createPool(cfg.connectionString);
  try {
    await runMigrations(pool);
    // eslint-disable-next-line no-console
    console.log('port-schedule: migrations applied.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
