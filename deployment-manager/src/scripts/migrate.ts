import pkg from 'pg';
const { Client } = pkg;

const config = {
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
};

const client = new Client(config);

async function initializeDatabase() {
  try {
    console.log('Creating tables...');
    
    await client.query(`
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
    await client.query(`
      ALTER TABLE apps
      ADD COLUMN IF NOT EXISTS cloudflare_zone_id TEXT
    `);

    // Add updated_at column to apps table
    await client.query(`
      ALTER TABLE apps
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    await client.query(`
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

    await client.query(`
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

    await client.query(`
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
    await client.query(`
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
    const dbExists = await client.query(`
      SELECT 1 FROM pg_database WHERE datname = '${process.env.BETTER_AUTH_DB}'
    `);

    if (dbExists.rows.length === 0) {
      // Create database if it doesn't exist
      await client.query(`CREATE DATABASE ${process.env.BETTER_AUTH_DB}`);
    }

    // Grant privileges
    await client.query(`
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

async function migrate() {
  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Starting database migration...');
    await initializeDatabase();
    await setupBetterAuthDatabase();
    console.log('Migration completed successfully');
    await client.end(); // Close the pool connection
  } catch (error) {
    console.error('Migration failed:', error);
    await client.end(); // Make sure to close the pool even on error
    throw error;
  }
}

export default migrate;
