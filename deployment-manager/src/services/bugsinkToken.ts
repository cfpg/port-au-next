import {
  fetchPlatformServiceSecret,
  upsertPlatformServiceSecret,
} from '~/queries/platformServiceSecretsQuery';
import logger from '~/services/logger';
import { execCompose } from '~/utils/compose';

const BUGSINK_INTERNAL_BASE_URL = 'http://bugsink:8000';
const BUGSINK_API_TOKEN_SECRET_TYPE = 'bugsink_api_token';

let cachedApiToken: string | null = null;

async function execBugsinkManage(command: string): Promise<string> {
  return execCompose(`exec -T bugsink bugsink-manage ${command}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBugsinkReady(maxAttempts = 12, delayMs = 5000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(BUGSINK_INTERNAL_BASE_URL, { redirect: 'manual' });
      if (res.ok || res.status === 302 || res.status === 301) {
        return true;
      }
    } catch {
      // Bugsink may still be starting (migrations, etc.)
    }
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }
  return false;
}

function parseAuthTokenFromOutput(output: string): string | null {
  const createdMatch = output.match(/Created AuthToken:\s*([a-f0-9]+)/i);
  if (createdMatch?.[1]) {
    return createdMatch[1];
  }

  const tokenMatch = output.match(/\b([a-f0-9]{40})\b/i);
  return tokenMatch?.[1] ?? null;
}

async function verifyBugsinkApiToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BUGSINK_INTERNAL_BASE_URL}/api/canonical/0/teams/`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getEnvApiTokenOverride(): string | null {
  return process.env.BUGSINK_API_TOKEN?.trim() || null;
}

export function clearBugsinkApiTokenCache(): void {
  cachedApiToken = null;
}

/**
 * Resolves the Bugsink API token: BUGSINK_API_TOKEN env override, then DB.
 */
export async function getBugsinkApiToken(): Promise<string | null> {
  if (cachedApiToken) {
    return cachedApiToken;
  }

  const envToken = getEnvApiTokenOverride();
  if (envToken) {
    cachedApiToken = envToken;
    return envToken;
  }

  const dbToken = await fetchPlatformServiceSecret(BUGSINK_API_TOKEN_SECRET_TYPE);
  if (dbToken) {
    cachedApiToken = dbToken;
    return dbToken;
  }

  return null;
}

export async function requireBugsinkApiToken(): Promise<string> {
  const token = await getBugsinkApiToken();
  if (!token) {
    throw new Error(
      'Bugsink API token is not available. Ensure BUGSINK_HOST is set and deployment-manager has bootstrapped Bugsink.'
    );
  }
  return token;
}

async function persistBugsinkApiToken(token: string): Promise<void> {
  await upsertPlatformServiceSecret(BUGSINK_API_TOKEN_SECRET_TYPE, token);
  cachedApiToken = token;
}

async function bootstrapBugsinkApiToken(): Promise<string | null> {
  const output = await execBugsinkManage('create_auth_token');
  const token = parseAuthTokenFromOutput(output);
  if (!token) {
    await logger.warning('Bugsink create_auth_token did not return a parseable token', {
      output: output.trim().slice(0, 200),
    });
    return null;
  }

  if (!(await verifyBugsinkApiToken(token))) {
    await logger.warning('Bugsink bootstrapped API token failed verification');
    return null;
  }

  await persistBugsinkApiToken(token);
  await logger.info('Bugsink API token bootstrapped and stored');
  return token;
}

/**
 * On startup: resolve, verify, or bootstrap the Bugsink platform API token.
 * BUGSINK_API_TOKEN in .env overrides DB and is synced to DB when valid.
 */
export async function ensureBugsinkApiToken(): Promise<void> {
  if (!process.env.BUGSINK_HOST?.trim()) {
    return;
  }

  const ready = await waitForBugsinkReady();
  if (!ready) {
    await logger.warning('Bugsink not reachable; skipping API token bootstrap');
    return;
  }

  const envToken = getEnvApiTokenOverride();
  if (envToken) {
    if (await verifyBugsinkApiToken(envToken)) {
      await persistBugsinkApiToken(envToken);
      await logger.info('Bugsink API token loaded from BUGSINK_API_TOKEN env override');
      return;
    }

    await logger.warning('BUGSINK_API_TOKEN env override failed verification; trying stored token');
    clearBugsinkApiTokenCache();
  }

  const storedToken = await fetchPlatformServiceSecret(BUGSINK_API_TOKEN_SECRET_TYPE);
  if (storedToken && (await verifyBugsinkApiToken(storedToken))) {
    cachedApiToken = storedToken;
    await logger.info('Bugsink API token loaded from database');
    return;
  }

  if (storedToken) {
    await logger.warning('Stored Bugsink API token failed verification; bootstrapping a new token');
  }

  clearBugsinkApiTokenCache();
  await bootstrapBugsinkApiToken();
}
