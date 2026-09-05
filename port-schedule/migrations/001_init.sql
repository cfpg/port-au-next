-- port-schedule P0 schema (run via npm run migrate or MIGRATE_ON_START=true)
CREATE SCHEMA IF NOT EXISTS port_schedule;

CREATE TABLE IF NOT EXISTS port_schedule.tenants (
  app_id INTEGER PRIMARY KEY,
  api_key_hash TEXT NOT NULL,
  api_key_sha256 CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS port_schedule.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  http_method TEXT NOT NULL,
  url TEXT NOT NULL,
  headers_json JSONB,
  body TEXT,
  webhook_secret TEXT,
  auth_scheme TEXT NOT NULL DEFAULT 'x-portaunext-schedule'
    CHECK (auth_scheme IN ('x-portaunext-schedule', 'bearer')),
  source TEXT NOT NULL DEFAULT 'api'
    CHECK (source IN ('api', 'vercel')),
  deleted_at TIMESTAMPTZ,
  last_fired_scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent for pre-existing tables created before these columns existed.
ALTER TABLE port_schedule.jobs ADD COLUMN IF NOT EXISTS auth_scheme TEXT NOT NULL DEFAULT 'x-portaunext-schedule';
ALTER TABLE port_schedule.jobs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'api';
DO $$ BEGIN
  ALTER TABLE port_schedule.jobs ADD CONSTRAINT jobs_auth_scheme_check CHECK (auth_scheme IN ('x-portaunext-schedule', 'bearer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE port_schedule.jobs ADD CONSTRAINT jobs_source_check CHECK (source IN ('api', 'vercel'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_app_id_name_undeleted
  ON port_schedule.jobs (app_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS jobs_scheduler_idx
  ON port_schedule.jobs (app_id, enabled)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS port_schedule.job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES port_schedule.jobs (id) ON DELETE CASCADE,
  app_id INTEGER NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  http_status INTEGER,
  error_message TEXT,
  response_headers_json JSONB,
  response_body TEXT,
  UNIQUE (job_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS job_runs_job_started_idx
  ON port_schedule.job_runs (job_id, started_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS job_runs_app_started_idx
  ON port_schedule.job_runs (app_id, started_at DESC NULLS LAST);
