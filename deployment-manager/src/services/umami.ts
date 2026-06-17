import crypto from 'crypto';

import pool from '~/services/database';
import logger from '~/services/logger';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import type { App } from '~/types';

export const UMAMI_SERVICE_TYPE = 'umami';

/** Docker Compose service on `port_au_next_network` (fixed; not configurable). */
export const UMAMI_INTERNAL_BASE_URL = 'http://umami:3000';

interface UmamiAuthResponse {
  token: string;
}

interface UmamiTeam {
  id: string;
  name: string;
}

interface UmamiUser {
  id: string;
  username: string;
  role: string;
}

interface UmamiWebsite {
  id: string;
  name: string;
  domain: string;
  teamId?: string | null;
}

export interface UmamiAppCredentials {
  enabled: boolean;
  websiteId: string;
  teamId: string;
  dashboardUsername: string;
  dashboardPassword: string;
}

let cachedAdminToken: string | null = null;

function requireUmamiHost(): string {
  const host = process.env.UMAMI_HOST?.trim();
  if (!host) {
    throw new Error('UMAMI_HOST is not set');
  }
  return host;
}

function getPublicUmamiBaseUrl(): string {
  return `https://${requireUmamiHost()}`;
}

function requireAdminCredentials(): { username: string; password: string } {
  const username = process.env.UMAMI_ADMIN_USERNAME?.trim();
  const password = process.env.UMAMI_ADMIN_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error('UMAMI_ADMIN_USERNAME and UMAMI_ADMIN_PASSWORD must be set');
  }
  return { username, password };
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

async function umamiRequest<T>(
  path: string,
  options: RequestInit = {},
  retryOnUnauthorized = true
): Promise<T> {
  const token = await getAdminToken();
  const res = await fetch(`${UMAMI_INTERNAL_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 401 && retryOnUnauthorized) {
    cachedAdminToken = null;
    return umamiRequest<T>(path, options, false);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Umami API ${options.method || 'GET'} ${path} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function getAdminToken(): Promise<string> {
  if (cachedAdminToken) {
    return cachedAdminToken;
  }

  const { username, password } = requireAdminCredentials();
  const res = await fetch(`${UMAMI_INTERNAL_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Umami admin login failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as UmamiAuthResponse;
  cachedAdminToken = data.token;
  return data.token;
}

async function createTeam(name: string): Promise<UmamiTeam> {
  return umamiRequest<UmamiTeam>('/api/teams', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

async function createUser(username: string, password: string): Promise<UmamiUser> {
  return umamiRequest<UmamiUser>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role: 'user' }),
  });
}

async function addUserToTeam(teamId: string, userId: string): Promise<void> {
  await umamiRequest(`/api/teams/${teamId}/users`, {
    method: 'POST',
    body: JSON.stringify({ userId, role: 'team-view-only' }),
  });
}

async function createWebsite(name: string, domain: string, teamId: string): Promise<UmamiWebsite> {
  return umamiRequest<UmamiWebsite>('/api/websites', {
    method: 'POST',
    body: JSON.stringify({ name, domain, teamId }),
  });
}

async function updateWebsiteDomain(websiteId: string, domain: string, name: string): Promise<void> {
  await umamiRequest(`/api/websites/${websiteId}`, {
    method: 'POST',
    body: JSON.stringify({ domain, name }),
  });
}

export async function getUmamiAppCredentials(
  appId: number
): Promise<UmamiAppCredentials | null> {
  const rows = await fetchAppServiceCredentialsQuery(appId, UMAMI_SERVICE_TYPE, false);
  const row = rows[0];
  if (!row || row.enabled === false) {
    return null;
  }

  if (!row.public_key || !row.secret_key || !row.username || !row.password) {
    return null;
  }

  return {
    enabled: true,
    websiteId: row.public_key,
    teamId: row.secret_key,
    dashboardUsername: row.username,
    dashboardPassword: row.password,
  };
}

export async function provisionUmamiForApp(app: App): Promise<UmamiAppCredentials> {
  requireUmamiHost();
  requireAdminCredentials();

  const existing = await fetchAppServiceCredentialsQuery(app.id, UMAMI_SERVICE_TYPE, false);
  if (existing[0]) {
    if (existing[0].enabled === false) {
      await pool.query(
        `UPDATE app_services
         SET enabled = true, updated_at = CURRENT_TIMESTAMP
         WHERE app_id = $1 AND service_type = $2 AND is_preview = false`,
        [app.id, UMAMI_SERVICE_TYPE]
      );
      const creds = await getUmamiAppCredentials(app.id);
      if (!creds) {
        throw new Error('Failed to re-enable Umami analytics');
      }
      if (app.domain) {
        await syncUmamiWebsiteDomain(app.id, app.domain, app.name);
      }
      return creds;
    }

    const creds = await getUmamiAppCredentials(app.id);
    if (creds) {
      return creds;
    }
  }

  if (!app.domain) {
    throw new Error('App domain is required before enabling analytics');
  }

  const teamName = `port-au-next:${app.name}`;
  const dashboardUsername = dashboardUsernameForApp(app);
  const dashboardPassword = generateDashboardPassword();

  const team = await createTeam(teamName);
  const user = await createUser(dashboardUsername, dashboardPassword);
  await addUserToTeam(team.id, user.id);
  const website = await createWebsite(app.name, app.domain, team.id);

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
      UMAMI_SERVICE_TYPE,
      website.id,
      team.id,
      dashboardUsername,
      dashboardPassword,
    ]
  );

  await logger.info('Umami analytics provisioned for app', {
    appId: app.id,
    app: app.name,
    websiteId: website.id,
  });

  return {
    enabled: true,
    websiteId: website.id,
    teamId: team.id,
    dashboardUsername,
    dashboardPassword,
  };
}

export async function disableUmamiForApp(appId: number): Promise<void> {
  const result = await pool.query(
    `UPDATE app_services
     SET enabled = false, updated_at = CURRENT_TIMESTAMP
     WHERE app_id = $1 AND service_type = $2 AND is_preview = false
     RETURNING id`,
    [appId, UMAMI_SERVICE_TYPE]
  );

  if (result.rowCount === 0) {
    throw new Error('Analytics is not configured for this app');
  }

  await logger.info('Umami analytics disabled for app', { appId });
}

export async function syncUmamiWebsiteDomain(
  appId: number,
  domain: string,
  appName?: string
): Promise<void> {
  if (!process.env.UMAMI_HOST?.trim()) {
    return;
  }

  const creds = await getUmamiAppCredentials(appId);
  if (!creds) {
    return;
  }

  const name =
    appName ||
    (
      await pool.query<{ name: string }>('SELECT name FROM apps WHERE id = $1', [appId])
    ).rows[0]?.name ||
    domain;

  await updateWebsiteDomain(creds.websiteId, domain, name);
  await logger.info('Synced Umami website domain', { appId, domain, websiteId: creds.websiteId });
}

/**
 * Production deploys only: inject Umami env vars when analytics is enabled.
 */
export async function getUmamiEnvVarsForProductionApp(
  app: App
): Promise<Record<string, string>> {
  if (!process.env.UMAMI_HOST?.trim()) {
    return {};
  }

  const creds = await getUmamiAppCredentials(app.id);
  if (!creds) {
    return {};
  }

  const host = getPublicUmamiBaseUrl();
  return {
    NEXT_PUBLIC_UMAMI_HOST: host,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: creds.websiteId,
  };
}

export function getUmamiDashboardUrl(): string {
  return getPublicUmamiBaseUrl();
}
