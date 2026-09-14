import { Pool, PoolConfig } from 'pg';
import crypto from 'crypto';

import logger from '~/services/logger';

export const config: PoolConfig = {
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
};

// Create a singleton pool instance
const pool = new Pool(config);

// Error handling for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;

// Helper function to get a client from the pool
export async function getClient() {
  const client = await pool.connect();
  return client;
}

// Helper function for transactions
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} 

export async function checkDatabaseExists(dbName: string, tempPool: Pool) {
  const result = await tempPool.query(`
    SELECT 1 FROM pg_database WHERE datname = $1
  `, [dbName]);
  return result.rows.length > 0;
}

export async function checkUserExists(dbUser: string, tempPool: Pool) {
  const result = await tempPool.query(`
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1
  `, [dbUser]);
  return result.rows.length > 0;
}

export async function setupAppDatabase(appName: string) {
  const dbUser = `${appName}_user`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbName = `${appName}_db`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbPassword = crypto.randomBytes(16).toString('hex');

  try {
    const tempPool = new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      host: process.env.POSTGRES_HOST || 'postgres',
      database: 'postgres',
      port: 5432
    });

    // Check if user exists
    const userExists = await checkUserExists(dbUser, tempPool);
    
    if (!userExists) {
      console.log(`Creating database user ${dbUser}...`);
      await tempPool.query(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
    } else {
      console.log(`User ${dbUser} already exists, updating password...`);
      // Use ALTER USER instead of CREATE USER for existing users
      await tempPool.query(`ALTER USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
    }

    // Check if database exists
    const dbExists = await checkDatabaseExists(dbName, tempPool);
    if (!dbExists) {
      console.log(`Creating database ${dbName}...`);
      await tempPool.query(`CREATE DATABASE ${dbName} OWNER ${dbUser}`);
    } else {
      console.log(`Database ${dbName} already exists, ensuring correct owner...`);
      // Need to disconnect all users before changing owner
      await tempPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [dbName]);
      await tempPool.query(`ALTER DATABASE ${dbName} OWNER TO ${dbUser}`);
    }

    // Restrict connection access - only the owning user should be able to connect
    await tempPool.query(`REVOKE CONNECT ON DATABASE ${dbName} FROM PUBLIC`);
    await tempPool.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${dbUser}`);

    await tempPool.end();

    return { dbUser, dbName, dbPassword };
  } catch (error) {
    console.error(`Error setting up database for ${appName}:`, error);
    throw error;
  }
}

/**
 * Read-only: deployments left in an in-progress status by a crash/restart, with enough
 * app/preview-branch context to check whether traffic was actually switched to them
 * before deciding whether to promote or fail them. See recoverContainers() in docker.ts -
 * this replaces the old cleanupStaleBuildingDeployments(), which failed all of these
 * unconditionally, including ones whose traffic switch had already succeeded.
 */
export async function getInterruptedDeployments() {
  const result = await pool.query(`
    SELECT a.id AS app_id, a.name, a.domain, a.branch,
           d.id AS deployment_id, d.container_id, d.branch AS deployment_branch, d.is_preview,
           pb.branch AS preview_branch, pb.subdomain AS preview_subdomain
    FROM deployments d
    JOIN apps a ON a.id = d.app_id
    LEFT JOIN preview_branches pb ON pb.id = d.preview_branch_id
    WHERE d.status IN ('building', 'pending', 'preflight', 'migrating')
  `);
  return result.rows;
}

export async function deduplicateActiveDeployments() {
  const result = await pool.query(`
    WITH ranked_active AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY app_id,
                 CASE
                   WHEN COALESCE(is_preview, FALSE)
                     THEN COALESCE(preview_branch_id, -id)
                   ELSE 0
                 END
               ORDER BY id DESC
             ) AS route_rank
      FROM deployments
      WHERE status = 'active'
    )
    UPDATE deployments d
    SET status = 'inactive',
        inactive_at = COALESCE(d.inactive_at, CURRENT_TIMESTAMP)
    FROM ranked_active r
    WHERE d.id = r.id
      AND r.route_rank > 1
    RETURNING d.id, d.app_id, d.branch, d.container_id
  `);
  return result.rows;
}

export async function cleanupOrphanedPreviewDeployments() {
  const result = await pool.query(`
    UPDATE deployments d
    SET status = 'inactive',
        inactive_at = COALESCE(inactive_at, CURRENT_TIMESTAMP)
    FROM preview_branches pb
    WHERE d.preview_branch_id = pb.id
      AND pb.deleted_at IS NOT NULL
      AND d.status = 'active'
    RETURNING d.id, d.app_id, d.branch
  `);
  return result.rows;
}

export async function getActiveDeployments() {
  const result = await pool.query(`
    SELECT a.id, a.name, a.domain, a.preview_domain, a.branch, a.root_path,
           a.db_user, a.db_password, a.db_name,
           d.id AS deployment_id, d.container_id, d.version,
           d.branch AS deployment_branch, d.is_preview,
           pb.branch AS preview_branch, pb.subdomain AS preview_subdomain
    FROM deployments d
    JOIN apps a ON a.id = d.app_id
    LEFT JOIN preview_branches pb ON pb.id = d.preview_branch_id
    WHERE d.status = 'active'
  `);
  return result.rows;
}

export async function updateDeploymentContainer(oldContainerId: string, newContainerId: string) {
  await pool.query(
    `UPDATE deployments 
     SET container_id = $1 
     WHERE container_id = $2`,
    [newContainerId, oldContainerId]
  );
}

export async function deleteAppDatabase(dbName: string, dbUser: string) {
  try {
    const tempPool = new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      host: 'postgres',
      database: 'postgres',
      port: 5432
    });

    // Terminate all connections to the database
    await tempPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity 
      WHERE datname = $1
    `, [dbName]);

    // Drop database and user
    await tempPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await tempPool.query(`DROP USER IF EXISTS ${dbUser}`);

    await tempPool.end();
  } catch (error) {
    logger.error(`Error deleting app database ${dbName} and user ${dbUser}`, error as Error);
    throw error;
  }
}

export async function grantCreateDb(dbUser: string): Promise<void> {
  const tempPool = new Pool({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST || 'postgres',
    database: 'postgres',
    port: 5432
  });
  try {
    await tempPool.query(`ALTER USER ${dbUser} CREATEDB`);
  } finally {
    await tempPool.end();
  }
}

export async function revokeCreateDb(dbUser: string): Promise<void> {
  const tempPool = new Pool({
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST || 'postgres',
    database: 'postgres',
    port: 5432
  });
  try {
    await tempPool.query(`ALTER USER ${dbUser} NOCREATEDB`);
  } finally {
    await tempPool.end();
  }
}

export async function deleteAppRecord(appId: number) {
  // `deployments.preview_branch_id` has no ON DELETE CASCADE, so a preview_branches row
  // can't be deleted while a deployment still references it. Clean up each preview
  // branch's container/nginx/database (but not its row) BEFORE deleting deployments,
  // then delete deployments (which drops the references), THEN the preview_branches
  // rows themselves - including already soft-deleted ones, since a soft-deleted row
  // still occupies the table and still blocks the FK.
  const { cleanupPreviewBranchResources } = await import('~/services/previewBranches');
  const appResult = await pool.query('SELECT name FROM apps WHERE id = $1', [appId]);
  const appName = appResult.rows[0]?.name;

  const previewBranches = await pool.query(
    'SELECT id, branch, container_id, db_name, db_user FROM preview_branches WHERE app_id = $1',
    [appId]
  );

  // Check every branch's cleanup BEFORE deleting anything: if any of them fails (e.g. a
  // database drop that can't reach Postgres), nothing below has run yet, so the app can
  // simply be deleted again later once the underlying issue is fixed - a partial delete
  // that removed some rows but not others would leave orphaned resources with no record
  // left to retry cleanup against.
  const cleanupFailures: string[] = [];
  for (const previewBranch of previewBranches.rows) {
    const result = await cleanupPreviewBranchResources(previewBranch, appName);
    if (!result.success) {
      cleanupFailures.push(`preview branch "${previewBranch.branch}": ${result.errors.join('; ')}`);
    }
  }
  if (cleanupFailures.length > 0) {
    throw new Error(
      `App deletion aborted before any records were removed - preview branch cleanup incomplete: ${cleanupFailures.join(' | ')}`
    );
  }

  await pool.query('DELETE FROM deployment_logs WHERE deployment_id IN (SELECT id FROM deployments WHERE app_id = $1)', [appId]);
  await pool.query('DELETE FROM app_env_vars WHERE app_id = $1', [appId]);
  await pool.query('DELETE FROM deployments WHERE app_id = $1', [appId]);
  await pool.query('DELETE FROM preview_branches WHERE app_id = $1', [appId]);
  // Finally delete the app record
  await pool.query('DELETE FROM apps WHERE id = $1', [appId]);
}
