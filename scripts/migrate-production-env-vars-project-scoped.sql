-- Canonicalize production environment variables as project-scoped rows.
--
-- Run only after the deployment-manager has been updated to write production
-- app_env_vars with branch = NULL. The transaction takes a table lock so an
-- environment save cannot race the migration.
--
-- Conflict policy for duplicate app/key rows:
--   1. Value for the app's currently configured production branch.
--   2. Existing project-scoped value (branch IS NULL).
--   3. Newest remaining row by id.

BEGIN;

LOCK TABLE app_env_vars IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE canonical_production_env_vars ON COMMIT DROP AS
SELECT DISTINCT ON (env.app_id, env.key)
  env.app_id,
  env.key,
  env.value,
  env.created_at
FROM app_env_vars AS env
JOIN apps AS app ON app.id = env.app_id
WHERE env.is_preview = false
ORDER BY
  env.app_id,
  env.key,
  (env.branch = app.branch) DESC NULLS LAST,
  (env.branch IS NULL) DESC,
  env.id DESC;

DELETE FROM app_env_vars
WHERE is_preview = false;

INSERT INTO app_env_vars (app_id, branch, key, value, is_preview, created_at)
SELECT app_id, NULL, key, value, false, created_at
FROM canonical_production_env_vars;

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
END
$$;

COMMIT;
