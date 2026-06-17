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
  user: UmamiUser;
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

const UMAMI_DEFAULT_ADMIN = {
  username: 'admin',
  password: 'umami',
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUmamiConfigured(): boolean {
  return Boolean(process.env.UMAMI_HOST?.trim());
}

function getAdminCredentialsFromEnv(): { username: string; password: string } | null {
  const username = process.env.UMAMI_ADMIN_USERNAME?.trim();
  const password = process.env.UMAMI_ADMIN_PASSWORD?.trim();
  if (!username || !password) {
    return null;
  }
  return { username, password };
}

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
  const creds = getAdminCredentialsFromEnv();
  if (!creds) {
    throw new Error('UMAMI_ADMIN_USERNAME and UMAMI_ADMIN_PASSWORD must be set');
  }
  return creds;
}

async function loginUmami(
  username: string,
  password: string
): Promise<UmamiAuthResponse | null> {
  try {
    const res = await fetch(`${UMAMI_INTERNAL_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as UmamiAuthResponse;
  } catch {
    return null;
  }
}

async function waitForUmamiReady(maxAttempts = 12, delayMs = 5000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${UMAMI_INTERNAL_BASE_URL}/api/heartbeat`);
      if (res.ok) {
        return true;
      }
    } catch {
      // Umami may still be starting (migrations, etc.)
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }
  return false;
}

async function updateUmamiUser(
  token: string,
  userId: string,
  updates: { username?: string; password?: string; role?: string }
): Promise<void> {
  const res = await fetch(`${UMAMI_INTERNAL_BASE_URL}/api/users/${userId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Umami update user failed: ${res.status} ${text}`);
  }
}

/**
 * On startup: ensure Umami's platform admin matches UMAMI_ADMIN_* in .env.
 * Fresh installs use default admin/umami; we rotate to .env credentials via API.
 */
export async function ensureUmamiPlatformAdmin(): Promise<void> {
  if (!isUmamiConfigured()) {
    return;
  }

  const target = getAdminCredentialsFromEnv();
  if (!target) {
    console.log('UMAMI_ADMIN_* not set; skipping Umami platform admin bootstrap');
    return;
  }

  const ready = await waitForUmamiReady();
  if (!ready) {
    await logger.warning('Umami not reachable; skipping platform admin bootstrap');
    return;
  }

  const envLogin = await loginUmami(target.username, target.password);
  if (envLogin) {
    cachedAdminToken = envLogin.token;
    await logger.info('Umami platform admin credentials verified');
    return;
  }

  const defaultLogin = await loginUmami(UMAMI_DEFAULT_ADMIN.username, UMAMI_DEFAULT_ADMIN.password);
  if (!defaultLogin) {
    await logger.warning(
      'Umami platform admin bootstrap skipped: .env credentials failed and default admin/umami login failed'
    );
    return;
  }

  await updateUmamiUser(defaultLogin.token, defaultLogin.user.id, {
    username: target.username,
    password: target.password,
    role: 'admin',
  });

  cachedAdminToken = null;
  const verify = await loginUmami(target.username, target.password);
  if (!verify) {
    throw new Error('Umami platform admin password sync failed verification');
  }

  cachedAdminToken = verify.token;
  await logger.info('Umami platform admin synced from .env', { username: target.username });
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
  const login = await loginUmami(username, password);
  if (!login) {
    throw new Error(
      'Umami admin login failed. Check UMAMI_ADMIN_USERNAME and UMAMI_ADMIN_PASSWORD in .env'
    );
  }

  cachedAdminToken = login.token;
  return login.token;
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
