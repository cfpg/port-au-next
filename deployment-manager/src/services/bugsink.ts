import pool from '~/services/database';
import logger from '~/services/logger';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import type { App } from '~/types';
import {
  clearBugsinkApiTokenCache,
  ensureBugsinkApiToken,
  requireBugsinkApiToken,
} from '~/services/bugsinkToken';

export const BUGSINK_SERVICE_TYPE = 'bugsink';

/** Docker Compose service on `port_au_next_network` (fixed; not configurable). */
export const BUGSINK_INTERNAL_BASE_URL = 'http://bugsink:8000';

interface BugsinkTeam {
  id: string;
  name: string;
  visibility?: string;
}

interface BugsinkProject {
  id: number;
  team: string;
  name: string;
  slug?: string;
  dsn?: string;
  visibility?: string;
}

export interface BugsinkAppCredentials {
  enabled: boolean;
  projectId: string;
  teamId: string;
  projectSlug: string;
  dsn: string;
}

function requireBugsinkHost(): string {
  const host = process.env.BUGSINK_HOST?.trim();
  if (!host) {
    throw new Error('BUGSINK_HOST is not set');
  }
  return host;
}

function getPublicBugsinkBaseUrl(): string {
  return `https://${requireBugsinkHost()}`;
}

async function bugsinkRequest<T>(
  path: string,
  options: RequestInit = {},
  retryOnUnauthorized = true
): Promise<T> {
  const token = await requireBugsinkApiToken();
  const res = await fetch(`${BUGSINK_INTERNAL_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 401 && retryOnUnauthorized) {
    clearBugsinkApiTokenCache();
    return bugsinkRequest<T>(path, options, false);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bugsink API ${options.method || 'GET'} ${path} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function createTeam(name: string): Promise<BugsinkTeam> {
  return bugsinkRequest<BugsinkTeam>('/api/canonical/0/teams/', {
    method: 'POST',
    body: JSON.stringify({ name, visibility: 'hidden' }),
  });
}

async function createProject(teamId: string, name: string): Promise<BugsinkProject> {
  const created = await bugsinkRequest<BugsinkProject>('/api/canonical/0/projects/', {
    method: 'POST',
    body: JSON.stringify({
      team: teamId,
      name,
      visibility: 'team_members',
    }),
  });

  return getProject(created.id);
}

async function getProject(projectId: number | string): Promise<BugsinkProject> {
  return bugsinkRequest<BugsinkProject>(`/api/canonical/0/projects/${projectId}/`);
}

async function updateProjectName(projectId: string, name: string): Promise<void> {
  await bugsinkRequest(`/api/canonical/0/projects/${projectId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

/**
 * On startup: bootstrap or verify the Bugsink platform API token.
 */
export async function ensureBugsinkPlatformReady(): Promise<void> {
  await ensureBugsinkApiToken();
}

export async function getBugsinkAppCredentials(
  appId: number
): Promise<BugsinkAppCredentials | null> {
  const rows = await fetchAppServiceCredentialsQuery(appId, BUGSINK_SERVICE_TYPE, false);
  const row = rows[0];
  if (!row || row.enabled === false) {
    return null;
  }

  if (!row.public_key || !row.secret_key || !row.password) {
    return null;
  }

  return {
    enabled: true,
    projectId: row.public_key,
    teamId: row.secret_key,
    projectSlug: row.username || '',
    dsn: row.password,
  };
}

export async function provisionBugsinkForApp(app: App): Promise<BugsinkAppCredentials> {
  requireBugsinkHost();
  await requireBugsinkApiToken();

  const existing = await fetchAppServiceCredentialsQuery(app.id, BUGSINK_SERVICE_TYPE, false);
  if (existing[0]) {
    if (existing[0].enabled === false) {
      await pool.query(
        `UPDATE app_services
         SET enabled = true, updated_at = CURRENT_TIMESTAMP
         WHERE app_id = $1 AND service_type = $2 AND is_preview = false`,
        [app.id, BUGSINK_SERVICE_TYPE]
      );
      const creds = await getBugsinkAppCredentials(app.id);
      if (!creds) {
        throw new Error('Failed to re-enable error tracking');
      }
      if (app.domain) {
        await syncBugsinkProjectName(app.id, app.name);
      }
      return creds;
    }

    const creds = await getBugsinkAppCredentials(app.id);
    if (creds) {
      return creds;
    }
  }

  if (!app.domain) {
    throw new Error('App domain is required before enabling error tracking');
  }

  const teamName = `port-au-next:${app.name}`;
  const team = await createTeam(teamName);
  const project = await createProject(team.id, app.name);

  if (!project.dsn) {
    throw new Error('Bugsink project created but DSN was not returned');
  }

  await pool.query(
    `INSERT INTO app_services
       (app_id, service_type, public_key, secret_key, username, password, enabled, is_preview)
     VALUES ($1, $2, $3, $4, $5, $6, true, false)
     ON CONFLICT (app_id, service_type, is_preview)
     DO UPDATE SET
       public_key = EXCLUDED.public_key,
       secret_key = EXCLUDED.secret_key,
       username = EXCLUDED.username,
       password = EXCLUDED.password,
       enabled = true,
       updated_at = CURRENT_TIMESTAMP`,
    [
      app.id,
      BUGSINK_SERVICE_TYPE,
      String(project.id),
      team.id,
      project.slug || app.name,
      project.dsn,
    ]
  );

  await logger.info('Bugsink error tracking provisioned for app', {
    appId: app.id,
    app: app.name,
    projectId: project.id,
  });

  return {
    enabled: true,
    projectId: String(project.id),
    teamId: team.id,
    projectSlug: project.slug || app.name,
    dsn: project.dsn,
  };
}

export async function disableBugsinkForApp(appId: number): Promise<void> {
  const result = await pool.query(
    `UPDATE app_services
     SET enabled = false, updated_at = CURRENT_TIMESTAMP
     WHERE app_id = $1 AND service_type = $2 AND is_preview = false
     RETURNING id`,
    [appId, BUGSINK_SERVICE_TYPE]
  );

  if (result.rowCount === 0) {
    throw new Error('Error tracking is not configured for this app');
  }

  await logger.info('Bugsink error tracking disabled for app', { appId });
}

export async function syncBugsinkProjectName(
  appId: number,
  appName?: string
): Promise<void> {
  if (!process.env.BUGSINK_HOST?.trim()) {
    return;
  }

  const creds = await getBugsinkAppCredentials(appId);
  if (!creds) {
    return;
  }

  const name =
    appName ||
    (
      await pool.query<{ name: string }>('SELECT name FROM apps WHERE id = $1', [appId])
    ).rows[0]?.name;

  if (!name) {
    return;
  }

  await updateProjectName(creds.projectId, name);
  await logger.info('Synced Bugsink project name', { appId, projectId: creds.projectId, name });
}

/**
 * Production deploys only: inject Sentry-compatible env vars when error tracking is enabled.
 */
export async function getBugsinkEnvVarsForProductionApp(
  app: App
): Promise<Record<string, string>> {
  if (!process.env.BUGSINK_HOST?.trim()) {
    return {};
  }

  const creds = await getBugsinkAppCredentials(app.id);
  if (!creds) {
    return {};
  }

  return {
    SENTRY_DSN: creds.dsn,
    NEXT_PUBLIC_SENTRY_DSN: creds.dsn,
    SENTRY_ENVIRONMENT: 'production',
  };
}

export function getBugsinkDashboardUrl(): string {
  return getPublicBugsinkBaseUrl();
}

export function getBugsinkProjectDashboardUrl(projectSlug: string): string {
  const base = getPublicBugsinkBaseUrl();
  return `${base}/p/${encodeURIComponent(projectSlug)}/issues/`;
}

export function maskDsn(dsn: string): string {
  try {
    const url = new URL(dsn);
    if (url.password) {
      url.password = '••••••••';
    }
    return url.toString();
  } catch {
    return '••••••••';
  }
}
