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

import { resolveGitAuth } from './resolveGitAuth';
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
});
