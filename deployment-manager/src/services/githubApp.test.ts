import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateKeyPairSync } from 'crypto';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

interface DecodedJwt {
  header: { alg: string; typ: string };
  payload: { iss: string; iat: number; exp: number };
}

function decodeJwt(token: string): DecodedJwt {
  const [headerB64, payloadB64] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')),
  };
}

const fetchMock = vi.fn();

describe('githubApp', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.GITHUB_APP_ID = '123456';
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
    process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.GITHUB_APP_SLUG = 'test-app';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_APP_SLUG;
  });

  it('signs a well-formed RS256 App JWT and requests a token scoped to exactly one repository', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ token: 'installation-token-abc', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
    });

    const { getInstallationToken } = await import('./githubApp');
    const token = await getInstallationToken(555, 42);

    expect(token).toBe('installation-token-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/app/installations/555/access_tokens');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ repository_ids: [42] });

    const authHeader = options.headers.Authorization as string;
    expect(authHeader.startsWith('Bearer ')).toBe(true);
    const jwt = authHeader.slice('Bearer '.length);

    const { header, payload } = decodeJwt(jwt);
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload.iss).toBe('123456');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600); // GitHub's hard cap
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('caches a token within its expiry safety margin instead of re-requesting', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ token: 'cached-token', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
    });

    const { getInstallationToken } = await import('./githubApp');
    const first = await getInstallationToken(555, 42);
    const second = await getInstallationToken(555, 42);

    expect(first).toBe('cached-token');
    expect(second).toBe('cached-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-requests once the cached token is within the expiry safety margin', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        // Expires in 30s - inside the 60s safety margin, so it must not be reused.
        json: async () => ({ token: 'about-to-expire', expires_at: new Date(Date.now() + 30_000).toISOString() }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ token: 'fresh-token', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      });

    const { getInstallationToken } = await import('./githubApp');
    const first = await getInstallationToken(555, 42);
    const second = await getInstallationToken(555, 42);

    expect(first).toBe('about-to-expire');
    expect(second).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches single-repo and all-repos tokens for the same installation separately', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ token: 'repo-scoped', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      })
      .mockResolvedValueOnce({
        // listInstallationRepositories mints its own (unrestricted) token first.
        ok: true,
        status: 201,
        json: async () => ({ token: 'all-repos', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ repositories: [{ id: 1, full_name: 'example/demo' }] }),
      });

    const { getInstallationToken, listInstallationRepositories } = await import('./githubApp');
    await getInstallationToken(555, 42);
    await listInstallationRepositories(555);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, repoScopedTokenOptions] = fetchMock.mock.calls[0];
    expect(JSON.parse(repoScopedTokenOptions.body)).toEqual({ repository_ids: [42] });
    const [, allReposTokenOptions] = fetchMock.mock.calls[1];
    // The all-repos token request has no repository_ids restriction.
    expect(allReposTokenOptions.body).toBeUndefined();
  });

  it('returns null (not a throw) when an installation does not belong to this platform\'s App', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const { verifyInstallationBelongsToApp } = await import('./githubApp');
    const result = await verifyInstallationBelongsToApp(999);

    expect(result).toBeNull();
  });

  it('resolves the account login when the installation does belong to this App', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ account: { login: 'octocat' }, app_id: 123456 }),
    });

    const { verifyInstallationBelongsToApp } = await import('./githubApp');
    const result = await verifyInstallationBelongsToApp(555);

    expect(result).toEqual({ accountLogin: 'octocat', appId: 123456 });
  });

  it('paginates listInstallationRepositories across multiple pages', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i, full_name: `org/repo-${i}` }));
    fetchMock
      .mockResolvedValueOnce({
        // Token mint, always the first call.
        ok: true,
        status: 201,
        json: async () => ({ token: 'all-repos', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ repositories: fullPage }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ repositories: [{ id: 999, full_name: 'org/last-repo' }] }),
      });

    const { listInstallationRepositories } = await import('./githubApp');
    const repos = await listInstallationRepositories(555);

    expect(repos).toHaveLength(101);
    expect(repos[100]).toEqual({ id: 999, fullName: 'org/last-repo' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('lists branch names for a repository, using the repo-scoped token', async () => {
    fetchMock
      .mockResolvedValueOnce({
        // Token mint, always the first call.
        ok: true,
        status: 201,
        json: async () => ({ token: 'repo-scoped', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ name: 'main' }, { name: 'feature/foo' }],
      });

    const { listRepositoryBranches } = await import('./githubApp');
    const branches = await listRepositoryBranches(555, 42, 'example/demo');

    expect(branches).toEqual(['main', 'feature/foo']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url] = fetchMock.mock.calls[1];
    expect(url).toContain('/repos/example/demo/branches');
  });

  it('paginates listRepositoryBranches across multiple pages', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ name: `branch-${i}` }));
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ token: 'repo-scoped', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => fullPage })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ name: 'last-branch' }] });

    const { listRepositoryBranches } = await import('./githubApp');
    const branches = await listRepositoryBranches(555, 42, 'example/demo');

    expect(branches).toHaveLength(101);
    expect(branches[100]).toBe('last-branch');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('URL-encodes the owner/repo segments when listing branches', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ token: 'repo-scoped', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });

    const { listRepositoryBranches } = await import('./githubApp');
    await listRepositoryBranches(555, 42, 'my org/repo name');

    const [url] = fetchMock.mock.calls[1];
    expect(url).toContain('/repos/my%20org/repo%20name/branches');
  });

  it('throws a clear, non-secret-leaking error when GitHub rejects the request', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    const { getInstallationToken } = await import('./githubApp');
    await expect(getInstallationToken(555, 42)).rejects.toThrow(/401/);
  });

  it('listAppInstallations paginates across every installation of the App', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i, account: { login: `org-${i}` } }));
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => fullPage })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 999, account: { login: 'last-org' } }],
      });

    const { listAppInstallations } = await import('./githubApp');
    const installations = await listAppInstallations();

    expect(installations).toHaveLength(101);
    expect(installations[100]).toEqual({ installationId: 999, accountLogin: 'last-org' });
    // No installation token minting needed here - this endpoint uses the App JWT directly.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe('findInstallationForRepo', () => {
    it('rejects a non-github.com repo URL without calling the GitHub API at all', async () => {
      const { findInstallationForRepo } = await import('./githubApp');
      const result = await findInstallationForRepo('https://gitlab.com/example/demo.git');

      expect(result).toEqual({ status: 'invalid_repo_url' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('finds the one installation (among several) that has access to the target repo', async () => {
      fetchMock
        .mockResolvedValueOnce({
          // listAppInstallations
          ok: true,
          status: 200,
          json: async () => [
            { id: 100, account: { login: 'org-a' } },
            { id: 200, account: { login: 'org-b' } },
          ],
        })
        .mockResolvedValueOnce({
          // installation 100's all-repos token
          ok: true,
          status: 201,
          json: async () => ({ token: 't1', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        })
        .mockResolvedValueOnce({
          // installation 100's repos - no match
          ok: true,
          status: 200,
          json: async () => ({ repositories: [{ id: 1, full_name: 'org-a/other-repo' }] }),
        })
        .mockResolvedValueOnce({
          // installation 200's all-repos token
          ok: true,
          status: 201,
          json: async () => ({ token: 't2', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        })
        .mockResolvedValueOnce({
          // installation 200's repos - matches
          ok: true,
          status: 200,
          json: async () => ({ repositories: [{ id: 2, full_name: 'org-b/target-repo' }] }),
        });

      const { findInstallationForRepo } = await import('./githubApp');
      const result = await findInstallationForRepo('https://github.com/org-b/target-repo.git');

      expect(result).toEqual({
        status: 'found',
        installationId: 200,
        accountLogin: 'org-b',
        repo: { id: 2, fullName: 'org-b/target-repo' },
      });
    });

    it('reports not_found when no installation has access to the repo', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: 100, account: { login: 'org-a' } }] })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ token: 't1', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ repositories: [{ id: 1, full_name: 'org-a/unrelated-repo' }] }),
        });

      const { findInstallationForRepo } = await import('./githubApp');
      const result = await findInstallationForRepo('https://github.com/org-a/target-repo.git');

      expect(result).toEqual({ status: 'not_found' });
    });

    it('reports ambiguous when more than one installation has access to the same repo', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => [
            { id: 100, account: { login: 'org-a' } },
            { id: 200, account: { login: 'org-b' } },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ token: 't1', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ repositories: [{ id: 1, full_name: 'shared-owner/target-repo' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ token: 't2', expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ repositories: [{ id: 1, full_name: 'shared-owner/target-repo' }] }),
        });

      const { findInstallationForRepo } = await import('./githubApp');
      const result = await findInstallationForRepo('https://github.com/shared-owner/target-repo.git');

      expect(result.status).toBe('ambiguous');
      expect(result.status === 'ambiguous' && result.matches.map((m) => m.accountLogin)).toEqual(['org-a', 'org-b']);
    });
  });
});
