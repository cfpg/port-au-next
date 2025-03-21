const { Client } = require('pg');

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

async function migrate() {
  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Starting database migration...');
    await initializeDatabase();
    console.log('Migration completed successfully');
    await client.end(); // Close the pool connection
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await client.end(); // Make sure to close the pool even on error
    process.exit(1);
  }
}

migrate();