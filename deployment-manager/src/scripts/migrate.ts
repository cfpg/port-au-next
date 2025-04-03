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

    // Make branch nullable to support shared preview env vars
    await client.query(`
      ALTER TABLE app_env_vars
      ALTER COLUMN branch DROP NOT NULL
    `);

    // Add is_preview column to app_env_vars
    await client.query(`
      ALTER TABLE app_env_vars
      ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT FALSE
    `);

    // Drop existing unique constraint if it exists
    await client.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'app_env_vars_app_id_branch_key_key'
        ) THEN
          ALTER TABLE app_env_vars 
          DROP CONSTRAINT app_env_vars_app_id_branch_key_key;
        END IF;
      END $$;
    `);

    // Add new unique constraint including is_preview
    await client.query(`
      ALTER TABLE app_env_vars
      ADD CONSTRAINT app_env_vars_app_id_is_preview_branch_key_key 
      UNIQUE(app_id, is_preview, branch, key)
    `);

    // Add comment to explain the env vars behavior
    await client.query(`
      COMMENT ON TABLE app_env_vars IS 'Environment variables for apps. When is_preview is true and branch is null, these vars are shared across all preview branches. When branch is specified, these vars override the shared preview vars for that specific branch.'
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

    // Add preview branches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS preview_branches (
        id SERIAL PRIMARY KEY,
        app_id INTEGER REFERENCES apps(id),
        branch TEXT,
        subdomain TEXT,
        db_name TEXT,
        db_user TEXT,
        db_password TEXT,
        container_id TEXT,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(app_id, branch)
      )
    `);

    // Add preview-related columns to deployments table
    await client.query(`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT FALSE;
      
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS preview_branch_id INTEGER REFERENCES preview_branches(id);
    `);

    await client.query(`
      ALTER TABLE deployments
      ADD CONSTRAINT check_preview_deployment 
      CHECK (
        (is_preview = TRUE AND preview_branch_id IS NOT NULL) OR
        (is_preview = FALSE AND preview_branch_id IS NULL)
      )
    `);

    // Add all indexes in a single query
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deployments_app_id ON deployments(app_id);
      CREATE INDEX IF NOT EXISTS idx_deployments_preview_branch_id ON deployments(preview_branch_id);
      CREATE INDEX IF NOT EXISTS idx_preview_branches_app_id ON preview_branches(app_id);
      CREATE INDEX IF NOT EXISTS idx_preview_branches_subdomain ON preview_branches(subdomain)
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