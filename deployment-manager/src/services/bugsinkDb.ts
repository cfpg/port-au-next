import { Pool } from 'pg';

import { checkDatabaseExists, checkUserExists } from '~/services/database';
import logger from '~/services/logger';

function getBugsinkDbConfig() {
  const user = process.env.BUGSINK_DB_USER?.trim();
  const password = process.env.BUGSINK_DB_PASSWORD?.trim();
  const database = process.env.BUGSINK_DB_NAME?.trim() || 'bugsink';

  if (!user || !password) {
    return null;
  }

  return { user, password, database };
}

/**
 * Creates the dedicated Bugsink database and role on shared Postgres (idempotent).
 * Skipped when BUGSINK_DB_USER / BUGSINK_DB_PASSWORD are unset.
 */
export async function ensureBugsinkDatabase(): Promise<void> {
  const cfg = getBugsinkDbConfig();
  if (!cfg) {
    console.log('BUGSINK_DB_USER/BUGSINK_DB_PASSWORD not set; skipping Bugsink database bootstrap');
    return;
  }

  const tempPool = new Pool({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST || 'postgres',
    database: 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  });

  try {
    const userExists = await checkUserExists(cfg.user, tempPool);
    const passwordLiteral = quoteLiteral(cfg.password);
    if (!userExists) {
      await tempPool.query(
        `CREATE USER ${quoteIdent(cfg.user)} WITH PASSWORD ${passwordLiteral}`
      );
      await logger.info('Created Bugsink database user', { user: cfg.user });
    } else {
      await tempPool.query(
        `ALTER USER ${quoteIdent(cfg.user)} WITH PASSWORD ${passwordLiteral}`
      );
    }

    const dbExists = await checkDatabaseExists(cfg.database, tempPool);
    if (!dbExists) {
      await tempPool.query(`CREATE DATABASE ${quoteIdent(cfg.database)} OWNER ${quoteIdent(cfg.user)}`);
      await logger.info('Created Bugsink database', { database: cfg.database });
    } else {
      await tempPool.query(`ALTER DATABASE ${quoteIdent(cfg.database)} OWNER TO ${quoteIdent(cfg.user)}`);
    }

    await tempPool.query(`REVOKE CONNECT ON DATABASE ${quoteIdent(cfg.database)} FROM PUBLIC`);
    await tempPool.query(`GRANT CONNECT ON DATABASE ${quoteIdent(cfg.database)} TO ${quoteIdent(cfg.user)}`);
  } finally {
    await tempPool.end();
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
