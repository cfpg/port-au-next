import pool from '../services/database';

export async function migrate() {
  try {
    await pool.query('BEGIN');

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

    // Make branch nullable to support shared preview env vars
    await pool.query(`
      ALTER TABLE app_env_vars
      ALTER COLUMN branch DROP NOT NULL
    `);

    // Add is_preview column to app_env_vars
    await pool.query(`
      ALTER TABLE app_env_vars
      ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT FALSE
    `);

    // Drop existing unique constraint if it exists
    await pool.query(`
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
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'app_env_vars_app_id_is_preview_branch_key_key'
        ) THEN
          ALTER TABLE app_env_vars
          ADD CONSTRAINT app_env_vars_app_id_is_preview_branch_key_key 
          UNIQUE(app_id, is_preview, branch, key);
        END IF;
      END $$;
    `);

    // Add comment to explain the env vars behavior
    await pool.query(`
      COMMENT ON TABLE app_env_vars IS 'Environment variables for apps. When is_preview is true and branch is null, these vars are shared across all preview branches. When branch is specified, these vars override the shared preview vars for that specific branch.'
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

    // Add preview branches table
    await pool.query(`
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
    await pool.query(`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT FALSE;
      
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS preview_branch_id INTEGER REFERENCES preview_branches(id);
    `);

    // Add check constraint for preview deployments
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'check_preview_deployment'
        ) THEN
          ALTER TABLE deployments
          ADD CONSTRAINT check_preview_deployment 
          CHECK (
            (is_preview = TRUE AND preview_branch_id IS NOT NULL) OR
            (is_preview = FALSE AND preview_branch_id IS NULL)
          );
        END IF;
      END $$;
    `);

    // Add all indexes in a single query
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deployments_app_id ON deployments(app_id);
      CREATE INDEX IF NOT EXISTS idx_deployments_preview_branch_id ON deployments(preview_branch_id);
      CREATE INDEX IF NOT EXISTS idx_preview_branches_app_id ON preview_branches(app_id);
      CREATE INDEX IF NOT EXISTS idx_preview_branches_subdomain ON preview_branches(subdomain)
    `);

    // Add preview_domain column to apps table
    await pool.query(`
      ALTER TABLE apps
      ADD COLUMN IF NOT EXISTS preview_domain TEXT
    `);

    // Create app_features table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_features (
        id SERIAL PRIMARY KEY,
        app_id INTEGER REFERENCES apps(id) ON DELETE CASCADE,
        feature TEXT NOT NULL,
        enabled BOOLEAN DEFAULT FALSE,
        config JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(app_id, feature)
      )
    `);

    // Add comment to explain the app_features table
    await pool.query(`
      COMMENT ON TABLE app_features IS 'Feature flags and configurations for apps. Each feature can be enabled/disabled and have its own configuration.'
    `);

    // Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_app_features_app_id ON app_features(app_id);
      CREATE INDEX IF NOT EXISTS idx_app_features_feature ON app_features(feature);
    `);

    // Alter Table Deploymebnts to add branch nullable columnd
    await pool.query(`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS branch TEXT
    `);

    await pool.query('COMMIT');
    console.log('Database migration completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error during migration:', error);
    throw error;
  }
}