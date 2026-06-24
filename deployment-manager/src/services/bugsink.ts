import crypto from 'crypto';

import pool from '~/services/database';
import logger from '~/services/logger';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import type { App } from '~/types';
import {
  clearBugsinkApiTokenCache,
  ensureBugsinkApiToken,
  requireBugsinkApiToken,
} from '~/services/bugsinkToken';
import { ensureBugsinkDashboardUser } from '~/services/bugsinkUser';

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

interface BugsinkListResponse<T> {
  next: string;
  previous: string;
  results: T[];
}

export interface BugsinkAppCredentials {
  enabled: boolean;
  projectId: string;
  teamId: string;
  projectSlug: string;
  dsn: string;
  dashboardUsername: string;
  dashboardPassword: string;
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

function generateDashboardPassword(): string {
  return crypto.randomBytes(16).toString('hex');
}

function sanitizeUsernamePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

function dashboardUsernameForApp(app: App): string {
  return `app-${app.id}-${sanitizeUsernamePart(app.name)}`;
}

function isLegacyDsnStoredInPassword(password: string | null | undefined): boolean {
  if (!password) {
    return false;
  }
  return password.startsWith('http://') || password.startsWith('https://');
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

async function listAllPages<T>(initialPath: string): Promise<T[]> {
  const all: T[] = [];
  let path: string | null = initialPath;

  while (path) {
    const page = await bugsinkRequest<BugsinkListResponse<T>>(path);
    all.push(...page.results);
    if (!page.next) {
      break;
    }
    try {
      const nextUrl = new URL(page.next, BUGSINK_INTERNAL_BASE_URL);
      path = `${nextUrl.pathname}${nextUrl.search}`;
    } catch {
      break;
    }
  }

  return all;
}

async function listTeams(): Promise<BugsinkTeam[]> {
  return listAllPages<BugsinkTeam>('/api/canonical/0/teams/');
}

async function listProjectsForTeam(teamId: string): Promise<BugsinkProject[]> {
  return listAllPages<BugsinkProject>(
    `/api/canonical/0/projects/?team=${encodeURIComponent(teamId)}`
  );
}

async function createTeam(name: string): Promise<BugsinkTeam> {
  return bugsinkRequest<BugsinkTeam>('/api/canonical/0/teams/', {
    method: 'POST',
    body: JSON.stringify({ name, visibility: 'hidden' }),
  });
}

async function findOrCreateTeam(name: string): Promise<BugsinkTeam> {
  const existing = (await listTeams()).find((team) => team.name === name);
  if (existing) {
    return existing;
  }

  try {
    return await createTeam(name);
  } catch (error) {
    const again = (await listTeams()).find((team) => team.name === name);
    if (again) {
      return again;
    }
    throw error;
  }
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

async function findOrCreateProject(teamId: string, name: string): Promise<BugsinkProject> {
  const existing = (await listProjectsForTeam(teamId)).find((project) => project.name === name);
  if (existing) {
    return getProject(existing.id);
  }

  try {
    return await createProject(teamId, name);
  } catch (error) {
    const again = (await listProjectsForTeam(teamId)).find((project) => project.name === name);
    if (again) {
      return getProject(again.id);
    }
    throw error;
  }
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

async function resolveBugsinkCredentialsFromRow(row: {
  enabled?: boolean | null;
  public_key?: string | null;
  secret_key?: string | null;
  username?: string | null;
  password?: string | null;
}): Promise<BugsinkAppCredentials | null> {
  if (!row.public_key || !row.secret_key) {
    return null;
  }

  if (isLegacyDsnStoredInPassword(row.password)) {
    return {
      enabled: row.enabled !== false,
      projectId: row.public_key,
      teamId: row.secret_key,
      projectSlug: row.username || '',
      dsn: row.password || '',
      dashboardUsername: '',
      dashboardPassword: '',
    };
  }

  if (!row.username || !row.password) {
    return null;
  }

  const project = await getProject(row.public_key);
  if (!project.dsn) {
    throw new Error('Bugsink project exists but DSN was not returned');
  }

  return {
    enabled: row.enabled !== false,
    projectId: row.public_key,
    teamId: row.secret_key,
    projectSlug: project.slug || row.username,
    dsn: project.dsn,
    dashboardUsername: row.username,
    dashboardPassword: row.password,
  };
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

  return resolveBugsinkCredentialsFromRow(row);
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
  const dashboardUsername = dashboardUsernameForApp(app);
  const dashboardPassword = generateDashboardPassword();

  const team = await findOrCreateTeam(teamName);
  const project = await findOrCreateProject(team.id, app.name);

  await ensureBugsinkDashboardUser(
    dashboardUsername,
    dashboardPassword,
    team.id,
    project.id
  );

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
      dashboardUsername,
      dashboardPassword,
    ]
  );

  const creds = await getBugsinkAppCredentials(app.id);
  if (!creds) {
    throw new Error('Failed to load provisioned error tracking credentials');
  }

  await logger.info('Bugsink error tracking provisioned for app', {
    appId: app.id,
    app: app.name,
    projectId: project.id,
    dashboardUsername,
  });

  return creds;
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
