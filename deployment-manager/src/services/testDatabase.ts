import pool from '~/services/database';
import { deleteAppDatabase, setupAppDatabase } from '~/services/database';
import logger from '~/services/logger';
import { App } from '~/types';

export const TEST_DATABASE_SERVICE_TYPE = 'test_database';

interface TestDatabaseRow {
  enabled: boolean;
  public_key: string | null;
  username: string | null;
  password: string | null;
}

export interface TestDatabaseStatus {
  enabled: boolean;
  database?: string;
}

async function getTestDatabaseRow(appId: number): Promise<TestDatabaseRow | null> {
  const result = await pool.query<TestDatabaseRow>(
    `SELECT enabled, public_key, username, password
     FROM app_services
     WHERE app_id = $1 AND service_type = $2 AND is_preview = false`,
    [appId, TEST_DATABASE_SERVICE_TYPE]
  );
  return result.rows[0] ?? null;
}

export async function getTestDatabaseStatus(appId: number): Promise<TestDatabaseStatus> {
  const row = await getTestDatabaseRow(appId);
  return {
    enabled: row?.enabled === true,
    database: row?.public_key || undefined,
  };
}

export async function provisionTestDatabaseForApp(app: App): Promise<TestDatabaseStatus> {
  const existing = await getTestDatabaseRow(app.id);
  if (existing?.public_key && existing.username && existing.password) {
    await pool.query(
      `UPDATE app_services
       SET enabled = true, updated_at = CURRENT_TIMESTAMP
       WHERE app_id = $1 AND service_type = $2 AND is_preview = false`,
      [app.id, TEST_DATABASE_SERVICE_TYPE]
    );
    return { enabled: true, database: existing.public_key };
  }

  const credentials = await setupAppDatabase(`${app.name}_test`);
  await pool.query(
    `INSERT INTO app_services
       (app_id, service_type, public_key, username, password, enabled, is_preview)
     VALUES ($1, $2, $3, $4, $5, true, false)
     ON CONFLICT (app_id, service_type, is_preview)
     DO UPDATE SET
       public_key = EXCLUDED.public_key,
       username = EXCLUDED.username,
       password = EXCLUDED.password,
       enabled = true,
       updated_at = CURRENT_TIMESTAMP`,
    [
      app.id,
      TEST_DATABASE_SERVICE_TYPE,
      credentials.dbName,
      credentials.dbUser,
      credentials.dbPassword,
    ]
  );

  await logger.info('Test database provisioned for app', {
    appId: app.id,
    app: app.name,
    database: credentials.dbName,
  });
  return { enabled: true, database: credentials.dbName };
}

export async function disableTestDatabaseForApp(appId: number): Promise<void> {
  const result = await pool.query(
    `UPDATE app_services
     SET enabled = false, updated_at = CURRENT_TIMESTAMP
     WHERE app_id = $1 AND service_type = $2 AND is_preview = false
     RETURNING id`,
    [appId, TEST_DATABASE_SERVICE_TYPE]
  );
  if (result.rowCount === 0) {
    throw new Error('Test database is not configured for this app');
  }
  await logger.info('Test database disabled for app', { appId });
}

export async function getTestDatabaseEnvVarsForProductionApp(
  app: App
): Promise<Record<string, string>> {
  const row = await getTestDatabaseRow(app.id);
  if (row?.enabled !== true || !row.public_key || !row.username || !row.password) {
    return {};
  }

  return {
    TEST_POSTGRES_HOST: 'postgres',
    TEST_POSTGRES_USER: row.username,
    TEST_POSTGRES_PASSWORD: row.password,
    TEST_POSTGRES_DB: row.public_key,
    TEST_DATABASE_URL: `postgres://${row.username}:${row.password}@postgres:5432/${row.public_key}`,
  };
}

export async function deleteTestDatabaseForApp(appId: number): Promise<void> {
  const row = await getTestDatabaseRow(appId);
  if (row?.public_key && row.username) {
    await deleteAppDatabase(row.public_key, row.username);
  }
}
