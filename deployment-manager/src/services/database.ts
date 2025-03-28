import { Client, Pool, PoolConfig } from 'pg';
import crypto from 'crypto';

import logger from '~/services/logger';

const config: PoolConfig = {
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

async function initializeDatabase() {
  try {
    console.log('Creating tables...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apps (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE,
        repo_url TEXT,
        branch TEXT DEFAULT 'main',
        domain TEXT,
        db_name TEXT,
        db_user TEXT,
        db_password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add Cloudflare Zone ID column
    await pool.query(`
      ALTER TABLE apps
      ADD COLUMN IF NOT EXISTS cloudflare_zone_id TEXT
    `);

    // Add updated_at column to apps table
    await pool.query(`
      ALTER TABLE apps
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deployments (
        id SERIAL PRIMARY KEY,
        app_id INTEGER REFERENCES apps(id),
        commit_id TEXT,
        version TEXT,
        status TEXT,
        container_id TEXT,
        deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_env_vars (
        id SERIAL PRIMARY KEY,
        app_id INTEGER REFERENCES apps(id),
        branch TEXT,
        key TEXT,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(app_id, branch, key)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deployment_logs (
        id SERIAL PRIMARY KEY,
        deployment_id INTEGER REFERENCES deployments(id),
        type TEXT CHECK (type IN ('info', 'error', 'warning', 'debug')),
        message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    throw error;
  }
}

async function setupBetterAuthDatabase() {
  try {
    console.log('Setting up Better Auth database...');
    console.log('Log env vars: DB USER: ', process.env.BETTER_AUTH_DB_USER, 'DB PASSWORD: ', process.env.BETTER_AUTH_DB_PASSWORD);
    console.log('Log env vars: DB: ', process.env.BETTER_AUTH_DB);
    
    // Create better-auth user if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '${process.env.BETTER_AUTH_DB_USER}') THEN
          CREATE USER ${process.env.BETTER_AUTH_DB_USER} WITH PASSWORD '${process.env.BETTER_AUTH_DB_PASSWORD}';
        ELSE
          ALTER USER ${process.env.BETTER_AUTH_DB_USER} WITH PASSWORD '${process.env.BETTER_AUTH_DB_PASSWORD}';
        END IF;
      END
      $$;
    `);

    // Check if database exists
    const dbExists = await pool.query(`
      SELECT 1 FROM pg_database WHERE datname = '${process.env.BETTER_AUTH_DB}'
    `);

    if (dbExists.rows.length === 0) {
      // Create database if it doesn't exist
      await pool.query(`CREATE DATABASE ${process.env.BETTER_AUTH_DB}`);
    }

    // Grant privileges
    await pool.query(`
      GRANT ALL PRIVILEGES ON DATABASE ${process.env.BETTER_AUTH_DB} TO ${process.env.BETTER_AUTH_DB_USER};
    `);

    // Connect to the better-auth database to set up schema privileges
    const betterAuthClient = new Client({
      ...config,
      database: process.env.BETTER_AUTH_DB
    });
    await betterAuthClient.connect();

    await betterAuthClient.query(`
      GRANT ALL ON SCHEMA public TO ${process.env.BETTER_AUTH_DB_USER};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${process.env.BETTER_AUTH_DB_USER};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${process.env.BETTER_AUTH_DB_USER};
    `);

    await betterAuthClient.end();
    console.log('Better Auth database setup completed');
  } catch (error) {
    console.error('Error setting up Better Auth database:', error);
    throw error;
  }
}

export async function dbMigrate() {
  try {
    console.log('Starting database migration...');
    await initializeDatabase();
    await setupBetterAuthDatabase();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
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
      host: 'postgres',
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

    await tempPool.end();

    return { dbUser, dbName, dbPassword };
  } catch (error) {
    console.error(`Error setting up database for ${appName}:`, error);
    throw error;
  }
}

export async function getActiveDeployments() {
  const result = await pool.query(`
    SELECT a.name, a.domain, d.container_id, d.version
    FROM deployments d
    JOIN apps a ON a.id = d.app_id
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

export async function deleteAppRecord(appId: number) {
  // Delete all related records first
  await pool.query('DELETE FROM deployment_logs WHERE deployment_id IN (SELECT id FROM deployments WHERE app_id = $1)', [appId]);
  await pool.query('DELETE FROM app_env_vars WHERE app_id = $1', [appId]);
  await pool.query('DELETE FROM deployments WHERE app_id = $1', [appId]);
  // Finally delete the app record
  await pool.query('DELETE FROM apps WHERE id = $1', [appId]);
}

export async function getAppDomains(): Promise<string[]> {
  try {
    // Fetch all domains from the apps table
    const result = await pool.query(`
      SELECT DISTINCT domain 
      FROM apps 
      WHERE domain IS NOT NULL AND domain != ''
    `);

    // Transform domains into full HTTPS URLs
    const origins = result.rows.map(row => 
      row.domain ? `https://${row.domain}` : ''
    ).filter(Boolean);

    return origins;
  } catch (error) {
    console.error('Error fetching App Domains:', error);
    // Fallback to wildcard if there's an error
    return ['*'];
  }
}