import { createSign } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { decryptSecret, encryptSecret } from '~/lib/encryption';
import { fetchGithubAppConfig, upsertGithubAppConfig } from '~/queries/githubAppConfigQuery';
import { normalizeGithubRepoFullName } from '~/utils/githubRepoMatch';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

export interface GithubAppConfig {
  appSlug: string;
  appId: string;
  clientId: string | null;
  privateKeyPem: string;
  webhookSecret: string;
}

/**
 * Resolves the platform's GitHub App config: env vars first (operator bootstrap without
 * touching the UI), then the DB row, decrypting the private key/webhook secret. Returns
 * null (not a throw) when unconfigured - callers that need it call requireGithubAppConfig()
 * instead. No in-memory cache here (unlike bugsinkToken.ts's pattern): this is looked up
 * once per job/request, not on a hot path, and a config CHANGE must be visible on the very
 * next read rather than surviving behind a stale cache.
 */
export async function getGithubAppConfig(): Promise<GithubAppConfig | null> {
  const envAppId = process.env.GITHUB_APP_ID?.trim();
  const envPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const envWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  const envSlug = process.env.GITHUB_APP_SLUG?.trim();

  if (envAppId && envPrivateKey && envWebhookSecret) {
    return {
      appSlug: envSlug || '',
      appId: envAppId,
      clientId: process.env.GITHUB_APP_CLIENT_ID?.trim() || null,
      // .env values commonly escape newlines - accept either literal or escaped form.
      privateKeyPem: envPrivateKey.replace(/\\n/g, '\n'),
      webhookSecret: envWebhookSecret,
    };
  }

  const row = await fetchGithubAppConfig();
  if (!row) {
    return null;
  }

  return {
    appSlug: row.app_slug,
    appId: row.app_id,
    clientId: row.client_id,
    privateKeyPem: decryptSecret(row.private_key_encrypted),
    webhookSecret: decryptSecret(row.webhook_secret_encrypted),
  };
}

export async function requireGithubAppConfig(): Promise<GithubAppConfig> {
  const config = await getGithubAppConfig();
  if (!config) {
    throw new Error('GitHub App is not configured. Set it up in Settings before connecting a repository.');
  }
  return config;
}

export async function saveGithubAppConfig(input: {
  appSlug: string;
  appId: string;
  clientId?: string | null;
  privateKeyPem: string;
  webhookSecret: string;
}): Promise<void> {
  await upsertGithubAppConfig({
    appSlug: input.appSlug,
    appId: input.appId,
    clientId: input.clientId,
    privateKeyEncrypted: encryptSecret(input.privateKeyPem),
    webhookSecretEncrypted: encryptSecret(input.webhookSecret),
  });
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * RS256 App JWT (GitHub docs: "Generating a JSON Web Token (JWT) for a GitHub App").
 * `iat` is backdated 60s for clock drift; `exp` capped well under GitHub's 10-minute max.
 */
function createAppJwt(appId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 540, iss: appId };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem, 'base64url');
  return `${signingInput}.${signature}`;
}

async function githubApiFetch(
  urlPath: string,
  options: { method?: string; token: string; body?: unknown } = { token: '' }
): Promise<unknown> {
  const response = await fetch(`${GITHUB_API_BASE}${urlPath}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    // Never include the token itself in the error - only status/path, which is safe to log.
    throw new Error(`GitHub API request failed: ${options.method ?? 'GET'} ${urlPath} -> ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export interface GithubInstallationInfo {
  accountLogin: string;
  appId: number;
}

/**
 * GET /app/installations/{id} using the App JWT. GitHub only returns an installation that
 * belongs to the App whose JWT was used to ask - a 404 here already proves the installation
 * does NOT belong to this platform's App, which is exactly the check the connect callback
 * needs before trusting a browser-supplied installation_id.
 */
export async function verifyInstallationBelongsToApp(installationId: number): Promise<GithubInstallationInfo | null> {
  const config = await requireGithubAppConfig();
  const jwt = createAppJwt(config.appId, config.privateKeyPem);

  try {
    const installation = (await githubApiFetch(`/app/installations/${installationId}`, { token: jwt })) as {
      account?: { login?: string; slug?: string };
      app_id: number;
    };
    return {
      accountLogin: installation.account?.login ?? installation.account?.slug ?? 'unknown',
      appId: installation.app_id,
    };
  } catch {
    return null;
  }
}

export interface GithubAppInstallationSummary {
  installationId: number;
  accountLogin: string;
}

/**
 * GET /app/installations using the App JWT - every installation of this platform's App,
 * across every account, paginated. Lets the "check for an existing installation" action
 * find one that was already created (e.g. via GitHub's own installation UI, or a
 * previously interrupted connect flow) without requiring a fresh redirect through GitHub.
 */
export async function listAppInstallations(): Promise<GithubAppInstallationSummary[]> {
  const config = await requireGithubAppConfig();
  const jwt = createAppJwt(config.appId, config.privateKeyPem);
  const installations: GithubAppInstallationSummary[] = [];
  let page = 1;

  while (true) {
    const result = (await githubApiFetch(`/app/installations?per_page=100&page=${page}`, { token: jwt })) as Array<{
      id: number;
      account?: { login?: string; slug?: string };
    }>;
    for (const installation of result) {
      installations.push({
        installationId: installation.id,
        accountLogin: installation.account?.login ?? installation.account?.slug ?? 'unknown',
      });
    }
    if (result.length < 100) {
      break;
    }
    page += 1;
  }

  return installations;
}

interface CachedInstallationToken {
  token: string;
  expiresAt: number;
}

// In-memory only, per the same reasoning as bugsinkToken.ts's cache: cheap to re-mint
// (~1hr lifetime), no reason to persist. Keyed so an all-repos token (used only during the
// connect flow, to discover/verify repo access) and a single-repo-scoped token (used by the
// deploy worker, minimum privilege) are cached separately.
const installationTokenCache = new Map<string, CachedInstallationToken>();
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

async function getCachedOrFreshToken(
  cacheKey: string,
  installationId: number,
  repoIds: number[] | undefined
): Promise<string> {
  const cached = installationTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + TOKEN_EXPIRY_SAFETY_MARGIN_MS) {
    return cached.token;
  }

  const config = await requireGithubAppConfig();
  const jwt = createAppJwt(config.appId, config.privateKeyPem);

  const body = repoIds ? { repository_ids: repoIds } : undefined;
  const result = (await githubApiFetch(`/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    token: jwt,
    body,
  })) as { token: string; expires_at: string };

  const expiresAt = Date.parse(result.expires_at);
  installationTokenCache.set(cacheKey, { token: result.token, expiresAt });
  return result.token;
}

/** A token scoped to exactly one repository - what the deploy worker uses (minimum privilege). */
export async function getInstallationToken(installationId: number, repoId: number): Promise<string> {
  return getCachedOrFreshToken(`${installationId}:${repoId}`, installationId, [repoId]);
}

/** A token covering every repository the installation can access - connect-flow discovery only. */
async function getInstallationAllReposToken(installationId: number): Promise<string> {
  return getCachedOrFreshToken(`${installationId}:all`, installationId, undefined);
}

export function clearInstallationTokenCache(installationId?: number): void {
  if (installationId === undefined) {
    installationTokenCache.clear();
    return;
  }
  for (const key of installationTokenCache.keys()) {
    if (key.startsWith(`${installationId}:`)) {
      installationTokenCache.delete(key);
    }
  }
}

export interface GithubRepoSummary {
  id: number;
  fullName: string;
}

/**
 * All repositories the installation currently has access to (GET /installation/repositories,
 * paginated). Used only to find the one matching the app being connected - never surfaced
 * as a free-form picker (see githubRepoMatch.ts's normalizeGithubRepoFullName).
 */
export async function listInstallationRepositories(installationId: number): Promise<GithubRepoSummary[]> {
  const token = await getInstallationAllReposToken(installationId);
  const repos: GithubRepoSummary[] = [];
  let page = 1;

  while (true) {
    const result = (await githubApiFetch(`/installation/repositories?per_page=100&page=${page}`, { token })) as {
      repositories?: Array<{ id: number; full_name: string }>;
    };
    const pageRepos = result.repositories ?? [];
    for (const repo of pageRepos) {
      repos.push({ id: repo.id, fullName: repo.full_name });
    }
    if (pageRepos.length < 100) {
      break;
    }
    page += 1;
  }

  return repos;
}

export type FindInstallationForRepoResult =
  | { status: 'found'; installationId: number; accountLogin: string; repo: GithubRepoSummary }
  | { status: 'not_found' }
  | { status: 'ambiguous'; matches: GithubAppInstallationSummary[] }
  | { status: 'invalid_repo_url' };

/**
 * Finds the one installation (if any) among ALL of this platform's App's installations
 * that already has access to `repoUrl` - the "check for an existing installation"
 * action's core logic, and also what the connect callback could reuse. Reads-only: never
 * writes github_installations itself, so callers stay in control of when a match becomes
 * a real connection.
 */
export async function findInstallationForRepo(repoUrl: string): Promise<FindInstallationForRepoResult> {
  const targetRepoFullName = normalizeGithubRepoFullName(repoUrl);
  if (!targetRepoFullName) {
    return { status: 'invalid_repo_url' };
  }

  const installations = await listAppInstallations();
  const matches: Array<{ installation: GithubAppInstallationSummary; repo: GithubRepoSummary }> = [];

  for (const installation of installations) {
    const repos = await listInstallationRepositories(installation.installationId);
    const repo = repos.find((r) => r.fullName.toLowerCase() === targetRepoFullName);
    if (repo) {
      matches.push({ installation, repo });
    }
  }

  if (matches.length === 0) {
    return { status: 'not_found' };
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', matches: matches.map((m) => m.installation) };
  }

  const [{ installation, repo }] = matches;
  return { status: 'found', installationId: installation.installationId, accountLogin: installation.accountLogin, repo };
}

// --- Git credential plumbing -------------------------------------------------------

/**
 * Writes (once per container lifetime) a tiny askpass helper that just echoes GIT_TOKEN.
 * Generated at runtime rather than shipped as a checked-in file: Next's standalone Docker
 * output only bundles what the build traces, so a repo-relative script would need its own
 * Dockerfile COPY line to survive into the image and could silently go stale if that line
 * and this code drift apart. Writing it from the running process guarantees it exists
 * and is executable wherever the process actually runs, with no Docker/build coupling.
 */
let askpassScriptPath: string | null = null;

export function ensureGitAskpassScript(): string {
  if (askpassScriptPath && fs.existsSync(askpassScriptPath)) {
    return askpassScriptPath;
  }
  const scriptPath = path.join(os.tmpdir(), 'port-au-next-git-askpass.sh');
  fs.writeFileSync(scriptPath, '#!/bin/sh\necho "$GIT_TOKEN"\n', { mode: 0o700 });
  askpassScriptPath = scriptPath;
  return scriptPath;
}
