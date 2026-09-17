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

    // Production environment variables are project-scoped. If historical rows
    // exist for multiple branches, prefer the currently configured app branch,
    // then an existing project-scoped row, then the newest remaining row.
    await pool.query(`
      WITH ranked_production_vars AS (
        SELECT
          env.id,
          ROW_NUMBER() OVER (
            PARTITION BY env.app_id, env.key
            ORDER BY
              (env.branch = app.branch) DESC NULLS LAST,
              (env.branch IS NULL) DESC,
              env.id DESC
          ) AS row_rank
        FROM app_env_vars env
        JOIN apps app ON app.id = env.app_id
        WHERE env.is_preview = false
      )
      DELETE FROM app_env_vars env
      USING ranked_production_vars ranked
      WHERE env.id = ranked.id
        AND ranked.row_rank > 1;

      UPDATE app_env_vars
      SET branch = NULL
      WHERE is_preview = false
        AND branch IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_env_vars_project_production_key
      ON app_env_vars (app_id, key)
      WHERE is_preview = false AND branch IS NULL;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'app_env_vars_production_branch_null'
            AND conrelid = 'app_env_vars'::regclass
        ) THEN
          ALTER TABLE app_env_vars
          ADD CONSTRAINT app_env_vars_production_branch_null
          CHECK (is_preview = true OR branch IS NULL);
        END IF;
      END $$;
    `);

    await pool.query(`
      COMMENT ON TABLE app_env_vars IS 'Project-scoped production variables use is_preview=false and branch=NULL. Preview variables use is_preview=true; branch=NULL is shared across previews and a branch value is a branch-specific override.'
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

    // Add deleted_at column to preview_branches for soft deletion
    await pool.query(`
      ALTER TABLE preview_branches
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE
    `);

    // Create app_services table for storing service credentials
    await pool.query(`
    CREATE TABLE IF NOT EXISTS app_services (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
        service_type VARCHAR(50) NOT NULL,
        username VARCHAR(255),
        password VARCHAR(255),
        secret_key VARCHAR(255),
        public_key VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(app_id, service_type)
    );
    `);

    // Add is_preview column to app_services if it doesn't exist
    await pool.query(`
    ALTER TABLE app_services
    ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT FALSE;
    `);

    // Update the unique constraint to include is_preview
    await pool.query(`
    DO $$
    BEGIN
      -- Drop the existing constraint if it exists
      IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'app_services_app_id_service_type_key'
      ) THEN
        ALTER TABLE app_services 
        DROP CONSTRAINT app_services_app_id_service_type_key;
      END IF;
      
      -- Add the new constraint if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'app_services_app_id_service_type_is_preview_key'
      ) THEN
        ALTER TABLE app_services
        ADD CONSTRAINT app_services_app_id_service_type_is_preview_key 
        UNIQUE(app_id, service_type, is_preview);
      END IF;
    END $$;
    `);

    await pool.query(`
      ALTER TABLE deployments
      ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS failed_at TIMESTAMP
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deployments_retention
      ON deployments (status, inactive_at, failed_at)
      WHERE status IN ('inactive', 'failed')
    `);

    await pool.query(`
      ALTER TABLE apps
      ADD COLUMN IF NOT EXISTS root_path TEXT NOT NULL DEFAULT ''
    `);

    await pool.query(`
      ALTER TABLE app_services
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloudflare_config (
        id SERIAL PRIMARY KEY,
        account_id TEXT NOT NULL,
        api_token_encrypted TEXT NOT NULL,
        tunnel_id TEXT,
        tunnel_name TEXT,
        tunnel_origin_url TEXT NOT NULL DEFAULT 'http://localhost',
        connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cloudflare_hostname_routes (
        id SERIAL PRIMARY KEY,
        hostname TEXT NOT NULL UNIQUE,
        zone_id TEXT NOT NULL,
        tunnel_id TEXT NOT NULL,
        dns_record_id TEXT,
        source_type TEXT NOT NULL CHECK (source_type IN ('app', 'service', 'preview_wildcard')),
        source_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cloudflare_hostname_routes_tunnel_id
      ON cloudflare_hostname_routes(tunnel_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cloudflare_hostname_routes_service
      ON cloudflare_hostname_routes(source_type, source_id)
      WHERE source_type = 'service'
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_service_secrets (
        service_type VARCHAR(50) PRIMARY KEY,
        secret_encrypted TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Single unified queue for manual and (future) webhook-triggered deployments.
    // See docs/SOW-github-autodeploy.md - 'webhook' source lands in a later phase.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deploy_queue_jobs (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK (source IN ('manual', 'webhook')),
        branch TEXT NOT NULL,
        requested_sha TEXT,
        requested_by_user_id TEXT,
        installation_id BIGINT,
        github_delivery_id TEXT,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
        deployment_id INTEGER REFERENCES deployments(id) ON DELETE SET NULL,
        error TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP WITH TIME ZONE,
        finished_at TIMESTAMP WITH TIME ZONE
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_deploy_queue_jobs_pending
      ON deploy_queue_jobs (id) WHERE status = 'queued'
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_deploy_queue_jobs_delivery
      ON deploy_queue_jobs (app_id, github_delivery_id) WHERE github_delivery_id IS NOT NULL
    `);

    // Push-triggered auto-deploy: a webhook job records the installation AND repository it
    // was accepted against (not just installation_id), so the worker can detect - before
    // doing any git/credential work - that the app's GitHub connection changed or was
    // removed while the job sat in the queue, and refuse rather than silently deploy
    // through a different repository or fall back to unauthenticated credentials.
    await pool.query(`
      ALTER TABLE deploy_queue_jobs
      ADD COLUMN IF NOT EXISTS repo_id BIGINT
    `);

    // PR-gated preview lifecycle: webhook jobs are either a deploy or a teardown. Existing
    // rows (manual deploys, production pushes) stay 'deploy'. github_pr_number is history
    // only - preview identity remains app_id+branch, never the PR number.
    await pool.query(`
      ALTER TABLE deploy_queue_jobs
      ADD COLUMN IF NOT EXISTS job_kind TEXT NOT NULL DEFAULT 'deploy'
    `);
    await pool.query(`
      ALTER TABLE deploy_queue_jobs
      ADD COLUMN IF NOT EXISTS github_pr_number INTEGER
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'deploy_queue_jobs_job_kind_check'
            AND conrelid = 'deploy_queue_jobs'::regclass
        ) THEN
          ALTER TABLE deploy_queue_jobs
          ADD CONSTRAINT deploy_queue_jobs_job_kind_check
          CHECK (job_kind IN ('deploy', 'teardown'));
        END IF;
      END $$;
    `);

    // GitHub App milestone: configuration, per-app installation mapping, and short-lived
    // connect-flow state. No webhook/auto-deploy schema here - deploy_queue_jobs already
    // carries installation_id/github_delivery_id from the earlier queue migration, unused
    // until that later milestone.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS github_app_config (
        id SERIAL PRIMARY KEY,
        app_slug TEXT NOT NULL,
        app_id TEXT NOT NULL,
        client_id TEXT,
        private_key_encrypted TEXT NOT NULL,
        webhook_secret_encrypted TEXT NOT NULL,
        connected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Enforces a single global row (one platform-wide GitHub App), the same way
    // cloudflare_config is treated as single-row by convention, but backed by a real
    // constraint here since two rows would silently make "the" config ambiguous.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_github_app_config_singleton
      ON github_app_config ((true))
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS github_installations (
        id SERIAL PRIMARY KEY,
        app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
        installation_id BIGINT NOT NULL,
        account_login TEXT NOT NULL,
        repo_id BIGINT NOT NULL,
        repo_full_name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (app_id)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_github_installations_installation_id
      ON github_installations (installation_id)
    `);

    // Single-use, short-lived state for the "Connect GitHub" callback. Consuming a row is
    // an atomic UPDATE ... SET used_at WHERE used_at IS NULL AND expires_at > now(), so a
    // replayed or expired token is rejected outright (see githubConnectStatesQuery.ts).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS github_connect_states (
        token_hash TEXT PRIMARY KEY,
        app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE
      )
    `);

    await pool.query('COMMIT');
    console.log('Database migration completed successfully');
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error during migration:', error);
    throw error;
  }
}
