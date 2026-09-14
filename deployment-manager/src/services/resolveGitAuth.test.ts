import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findInstallationMock, getTokenMock, ensureAskpassMock, setRedactionContextMock } = vi.hoisted(() => ({
  findInstallationMock: vi.fn(),
  getTokenMock: vi.fn(),
  ensureAskpassMock: vi.fn(),
  setRedactionContextMock: vi.fn(),
}));

vi.mock('~/queries/githubInstallationsQuery', () => ({
  findGithubInstallationForApp: findInstallationMock,
}));

vi.mock('~/services/githubApp', () => ({
  getInstallationToken: getTokenMock,
  ensureGitAskpassScript: ensureAskpassMock,
}));

vi.mock('~/services/logger', () => ({
  default: { setRedactionContext: setRedactionContextMock },
}));

import {
  resolveGitAuth,
  assertWebhookConnectionUnchanged,
  GithubRepoMismatchError,
  GithubConnectionChangedError,
} from './resolveGitAuth';
import { App } from '~/types';

const app: App = {
  id: 1,
  name: 'demo',
  repo_url: 'https://github.com/example/demo.git',
  branch: 'main',
  status: 'active',
};

beforeEach(() => {
  findInstallationMock.mockReset();
  getTokenMock.mockReset();
  ensureAskpassMock.mockReset();
  setRedactionContextMock.mockReset();
});

describe('resolveGitAuth', () => {
  it('returns undefined for an app with no GitHub installation - existing manual-deploy behavior unchanged', async () => {
    findInstallationMock.mockResolvedValue(null);

    const auth = await resolveGitAuth(app);

    expect(auth).toBeUndefined();
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(setRedactionContextMock).not.toHaveBeenCalled();
  });

  it('mints a repo-scoped token, registers it for redaction, and returns a credential-free clone URL', async () => {
    findInstallationMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });
    getTokenMock.mockResolvedValue('ghs_livetoken123');
    ensureAskpassMock.mockReturnValue('/tmp/port-au-next-git-askpass.sh');

    const auth = await resolveGitAuth(app);

    expect(getTokenMock).toHaveBeenCalledWith(555, 42); // numeric, not the raw BIGINT strings
    expect(setRedactionContextMock).toHaveBeenCalledWith({ GITHUB_INSTALLATION_TOKEN: 'ghs_livetoken123' });
    expect(auth).toEqual({
      cloneUrl: 'https://x-access-token@github.com/example/demo.git',
      askpassPath: '/tmp/port-au-next-git-askpass.sh',
      token: 'ghs_livetoken123',
    });
    // The clone URL itself must never carry the token.
    expect(auth?.cloneUrl).not.toContain('ghs_livetoken123');
  });

  it('accepts an SSH repo_url that refers to the same repository the installation is connected for', async () => {
    findInstallationMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });
    getTokenMock.mockResolvedValue('ghs_livetoken123');
    ensureAskpassMock.mockReturnValue('/tmp/port-au-next-git-askpass.sh');

    const auth = await resolveGitAuth({ ...app, repo_url: 'git@github.com:example/demo.git' });

    expect(auth).toBeDefined();
    expect(getTokenMock).toHaveBeenCalled();
  });

  it('rejects when the app repo_url no longer matches the connected installation, without minting a token', async () => {
    findInstallationMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });

    await expect(
      resolveGitAuth({ ...app, repo_url: 'https://github.com/example/some-other-repo.git' })
    ).rejects.toBeInstanceOf(GithubRepoMismatchError);

    expect(getTokenMock).not.toHaveBeenCalled();
    expect(setRedactionContextMock).not.toHaveBeenCalled();
  });

  describe('webhook job origin binding', () => {
    it('mints a token when the current installation matches exactly what the webhook job was queued against', async () => {
      findInstallationMock.mockResolvedValue({
        installation_id: '555',
        repo_id: '42',
        repo_full_name: 'example/demo',
      });
      getTokenMock.mockResolvedValue('ghs_livetoken123');
      ensureAskpassMock.mockReturnValue('/tmp/port-au-next-git-askpass.sh');

      const auth = await resolveGitAuth(app, { installationId: '555', repoId: '42' });

      expect(auth).toBeDefined();
      expect(getTokenMock).toHaveBeenCalledWith(555, 42);
    });

    it('rejects a webhook job when the app has since been disconnected entirely - never falls back to unauthenticated behavior', async () => {
      findInstallationMock.mockResolvedValue(null);

      await expect(resolveGitAuth(app, { installationId: '555', repoId: '42' })).rejects.toBeInstanceOf(
        GithubConnectionChangedError
      );

      expect(getTokenMock).not.toHaveBeenCalled();
      expect(setRedactionContextMock).not.toHaveBeenCalled();
    });

    it('rejects a webhook job when the app reconnected to a different installation while it was queued', async () => {
      findInstallationMock.mockResolvedValue({
        installation_id: '999', // a different installation now connected
        repo_id: '42',
        repo_full_name: 'example/demo',
      });

      await expect(resolveGitAuth(app, { installationId: '555', repoId: '42' })).rejects.toBeInstanceOf(
        GithubConnectionChangedError
      );

      expect(getTokenMock).not.toHaveBeenCalled();
    });

    it('rejects a webhook job when the connected repository id has changed, even under the same installation', async () => {
      findInstallationMock.mockResolvedValue({
        installation_id: '555',
        repo_id: '77', // a different repository now connected under the same installation
        repo_full_name: 'example/demo',
      });

      await expect(resolveGitAuth(app, { installationId: '555', repoId: '42' })).rejects.toBeInstanceOf(
        GithubConnectionChangedError
      );

      expect(getTokenMock).not.toHaveBeenCalled();
    });

    it('does not apply the stricter origin check to a manual (non-webhook) call', async () => {
      // Same "no installation" scenario as the very first test above, confirming the
      // ordinary manual-deploy behavior (return undefined, no throw) is untouched when
      // no webhookOrigin is passed.
      findInstallationMock.mockResolvedValue(null);

      const auth = await resolveGitAuth(app);

      expect(auth).toBeUndefined();
    });
  });

  describe('single-read regression coverage (TOCTOU between validation and credential use)', () => {
    it('reads the installation exactly once per call - nothing left to race between validating it and minting a token from it', async () => {
      findInstallationMock.mockResolvedValue({
        installation_id: '555',
        repo_id: '42',
        repo_full_name: 'example/demo',
      });
      getTokenMock.mockResolvedValue('ghs_livetoken123');
      ensureAskpassMock.mockReturnValue('/tmp/port-au-next-git-askpass.sh');

      await resolveGitAuth(app, { installationId: '555', repoId: '42' });

      expect(findInstallationMock).toHaveBeenCalledTimes(1);
    });

    it('never mints a token from a would-be second, independent read of the installation', async () => {
      // If resolveGitAuth ever re-queried the installation after validating it, a second
      // call here would return a DIFFERENT installation (999/77) than the one just
      // validated (555/42) - exactly the race that let a reconnect-between-reads mint
      // credentials for the wrong installation/repository. Queuing this second value
      // proves it: it must never be consumed, because there must never be a second read.
      findInstallationMock
        .mockResolvedValueOnce({ installation_id: '555', repo_id: '42', repo_full_name: 'example/demo' })
        .mockResolvedValueOnce({ installation_id: '999', repo_id: '77', repo_full_name: 'someone-else/other-repo' });
      getTokenMock.mockResolvedValue('ghs_livetoken123');
      ensureAskpassMock.mockReturnValue('/tmp/port-au-next-git-askpass.sh');

      await resolveGitAuth(app, { installationId: '555', repoId: '42' });

      expect(findInstallationMock).toHaveBeenCalledTimes(1);
      expect(getTokenMock).toHaveBeenCalledWith(555, 42); // never 999/77
    });

    it('does not fall back to unauthenticated access when a would-be second read would have found the app disconnected', async () => {
      // Same idea in the other direction: a second, independent read here would see the
      // installation gone (a disconnect that raced the first read) - if resolveGitAuth
      // ever consumed that second read, this would previously return `undefined` (silent,
      // unauthenticated "unconnected app" behavior) instead of using the already-validated
      // result.
      findInstallationMock
        .mockResolvedValueOnce({ installation_id: '555', repo_id: '42', repo_full_name: 'example/demo' })
        .mockResolvedValueOnce(null);
      getTokenMock.mockResolvedValue('ghs_livetoken123');
      ensureAskpassMock.mockReturnValue('/tmp/port-au-next-git-askpass.sh');

      const auth = await resolveGitAuth(app, { installationId: '555', repoId: '42' });

      expect(auth).toBeDefined();
      expect(findInstallationMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('assertWebhookConnectionUnchanged', () => {
  it('returns the validated installation row on success, for the caller to reuse without re-querying', async () => {
    const installation = { installation_id: '555', repo_id: '42', repo_full_name: 'example/demo' };
    findInstallationMock.mockResolvedValue(installation);

    const result = await assertWebhookConnectionUnchanged(app, { installationId: '555', repoId: '42' });

    expect(result).toBe(installation); // the SAME object, not a re-fetched copy
  });

  it('throws GithubConnectionChangedError on a mismatched installation id', async () => {
    findInstallationMock.mockResolvedValue({ installation_id: '999', repo_id: '42', repo_full_name: 'example/demo' });

    await expect(
      assertWebhookConnectionUnchanged(app, { installationId: '555', repoId: '42' })
    ).rejects.toBeInstanceOf(GithubConnectionChangedError);
  });

  it('throws GithubConnectionChangedError when there is no installation at all', async () => {
    findInstallationMock.mockResolvedValue(null);

    await expect(
      assertWebhookConnectionUnchanged(app, { installationId: '555', repoId: '42' })
    ).rejects.toBeInstanceOf(GithubConnectionChangedError);
  });

  it('throws GithubRepoMismatchError when the installation/repo ids match but the app repo_url has diverged - the pre-provision gap this closes', async () => {
    // ids match exactly what the job was queued against, but the app's repo_url was
    // edited to point somewhere else while the job sat in the queue.
    findInstallationMock.mockResolvedValue({ installation_id: '555', repo_id: '42', repo_full_name: 'example/demo' });

    await expect(
      assertWebhookConnectionUnchanged(
        { ...app, repo_url: 'https://github.com/example/a-different-repo.git' },
        { installationId: '555', repoId: '42' }
      )
    ).rejects.toBeInstanceOf(GithubRepoMismatchError);
  });

  it('accepts a repo_url that normalizes to the same repository even in a different URL style', async () => {
    findInstallationMock.mockResolvedValue({ installation_id: '555', repo_id: '42', repo_full_name: 'example/demo' });

    await expect(
      assertWebhookConnectionUnchanged(
        { ...app, repo_url: 'git@github.com:example/demo.git' },
        { installationId: '555', repoId: '42' }
      )
    ).resolves.toBeDefined();
  });
});
