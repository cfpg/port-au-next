import { describe, it, expect, vi, beforeEach } from 'vitest';

const { poolQueryMock, findGithubInstallationForAppMock, grantCreateDbMock, revokeCreateDbMock, syncPreviewWildcardRouteMock } =
  vi.hoisted(() => ({
    poolQueryMock: vi.fn(),
    findGithubInstallationForAppMock: vi.fn(),
    grantCreateDbMock: vi.fn(),
    revokeCreateDbMock: vi.fn(),
    syncPreviewWildcardRouteMock: vi.fn(),
  }));

vi.mock('~/lib/auth-utils', () => ({
  withAuth: (action: (...args: unknown[]) => unknown) => action,
}));
vi.mock('~/services/database', () => ({
  default: { query: poolQueryMock },
  grantCreateDb: grantCreateDbMock,
  revokeCreateDb: revokeCreateDbMock,
}));
vi.mock('~/services/cloudflareRoutes', () => ({
  syncPreviewWildcardRoute: syncPreviewWildcardRouteMock,
}));
vi.mock('~/queries/githubInstallationsQuery', () => ({
  findGithubInstallationForApp: findGithubInstallationForAppMock,
}));

import { PATCH } from './route';
import { AppFeature } from '~/types/appFeatures';

function patchRequest(body: unknown): Request {
  return new Request('https://example.com/api/apps/5/features', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// withAuth's real type signature allows an undefined return (the redirect-to-login path,
// mocked away above to a passthrough that never takes it) - these tests only exercise the
// passthrough, so a response is always returned in practice.
async function callPatch(body: unknown, appId: string) {
  const response = await PATCH(patchRequest(body), { params: Promise.resolve({ appId }) });
  if (!response) throw new Error('Expected a response, got undefined');
  return response;
}

/** SQL-text dispatch so call order isn't load-bearing in these tests. */
function mockPoolFor({
  existingConfig = {},
  repoUrl,
}: {
  existingConfig?: Record<string, unknown>;
  repoUrl?: string;
} = {}) {
  poolQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT config FROM app_features')) {
      return { rows: [{ config: existingConfig }] };
    }
    if (sql.includes('SELECT repo_url FROM apps')) {
      return { rows: repoUrl ? [{ repo_url: repoUrl }] : [] };
    }
    if (sql.includes('INSERT INTO app_features')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT db_user FROM apps')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT preview_domain FROM apps')) {
      return { rows: [{ preview_domain: null }] };
    }
    throw new Error(`Unexpected query in test: ${sql}`);
  });
}

beforeEach(() => {
  poolQueryMock.mockReset();
  findGithubInstallationForAppMock.mockReset();
  grantCreateDbMock.mockReset();
  revokeCreateDbMock.mockReset();
  syncPreviewWildcardRouteMock.mockReset();
});

describe('PATCH /api/apps/[appId]/features - route params', () => {
  it('correctly awaits a Promise-wrapped params object (Next.js 15 dynamic API routes)', async () => {
    mockPoolFor();
    findGithubInstallationForAppMock.mockResolvedValue(null);

    const response = await callPatch({ feature: AppFeature.PREVIEW_BRANCHES, enabled: false }, '5');

    expect(response.status).toBe(200);
  });
});

describe('PATCH /api/apps/[appId]/features - auto_deploy validation', () => {
  it('rejects enabling auto_deploy on an app with no GitHub connection, and never writes the feature row', async () => {
    mockPoolFor();
    findGithubInstallationForAppMock.mockResolvedValue(null);

    const response = await callPatch({ feature: AppFeature.AUTO_DEPLOY, enabled: true }, '5');

    expect(response.status).toBe(400);
    expect(poolQueryMock.mock.calls.some(([sql]) => sql.includes('INSERT INTO app_features'))).toBe(false);
  });

  it('rejects enabling auto_deploy when the app repo_url has diverged from the connected installation', async () => {
    mockPoolFor({ repoUrl: 'https://github.com/example/a-different-repo.git' });
    findGithubInstallationForAppMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });

    const response = await callPatch({ feature: AppFeature.AUTO_DEPLOY, enabled: true }, '5');

    expect(response.status).toBe(400);
    expect(poolQueryMock.mock.calls.some(([sql]) => sql.includes('INSERT INTO app_features'))).toBe(false);
  });

  it('allows enabling auto_deploy when the connection matches the app\'s current repository', async () => {
    mockPoolFor({ repoUrl: 'https://github.com/example/demo.git' });
    findGithubInstallationForAppMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });

    const response = await callPatch({ feature: AppFeature.AUTO_DEPLOY, enabled: true }, '5');

    expect(response.status).toBe(200);
    expect(poolQueryMock.mock.calls.some(([sql]) => sql.includes('INSERT INTO app_features'))).toBe(true);
  });

  it('always allows disabling auto_deploy, without even checking the GitHub connection', async () => {
    mockPoolFor();

    const response = await callPatch({ feature: AppFeature.AUTO_DEPLOY, enabled: false }, '5');

    expect(response.status).toBe(200);
    expect(findGithubInstallationForAppMock).not.toHaveBeenCalled();
    expect(poolQueryMock.mock.calls.some(([sql]) => sql.includes('INSERT INTO app_features'))).toBe(true);
  });
});

describe('PATCH /api/apps/[appId]/features - unrelated feature behavior unchanged', () => {
  it('still toggles preview_branches without requiring any GitHub connection check', async () => {
    mockPoolFor();

    const response = await callPatch({ feature: AppFeature.PREVIEW_BRANCHES, enabled: false }, '5');

    expect(response.status).toBe(200);
    expect(findGithubInstallationForAppMock).not.toHaveBeenCalled();
  });
});
