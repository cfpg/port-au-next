import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  fetchSingleAppQueryMock,
  findGithubInstallationForAppMock,
  deleteGithubInstallationForAppMock,
  clearInstallationTokenCacheMock,
  isAutoDeployEnabledMock,
  disableAutoDeployMock,
  existsSyncMock,
} = vi.hoisted(() => ({
  fetchSingleAppQueryMock: vi.fn(),
  findGithubInstallationForAppMock: vi.fn(),
  deleteGithubInstallationForAppMock: vi.fn(),
  clearInstallationTokenCacheMock: vi.fn(),
  isAutoDeployEnabledMock: vi.fn(),
  disableAutoDeployMock: vi.fn(),
  existsSyncMock: vi.fn().mockReturnValue(false),
}));

vi.mock('~/lib/auth-utils', () => ({
  withAuth: (action: (...args: unknown[]) => unknown) => action,
}));
vi.mock('~/queries/fetchSingleAppQuery', () => ({ default: fetchSingleAppQueryMock }));
vi.mock('~/queries/githubInstallationsQuery', () => ({
  findGithubInstallationForApp: findGithubInstallationForAppMock,
  deleteGithubInstallationForApp: deleteGithubInstallationForAppMock,
}));
vi.mock('~/services/githubApp', () => ({
  clearInstallationTokenCache: clearInstallationTokenCacheMock,
}));
vi.mock('~/services/appFeatures', () => ({
  isAutoDeployEnabled: isAutoDeployEnabledMock,
  disableAutoDeploy: disableAutoDeployMock,
}));
vi.mock('fs', () => ({ default: { existsSync: existsSyncMock }, existsSync: existsSyncMock }));
vi.mock('~/utils/getAppsDir', () => ({ default: () => '/apps-test' }));

import { GET, DELETE } from './route';

// withAuth's real type signature allows an undefined return (the redirect-to-login path,
// mocked away above to a passthrough that never takes it) - these tests only exercise the
// passthrough, so a response is always returned in practice.
async function call(handler: typeof GET | typeof DELETE, request: Request, appId: string) {
  const response = await handler(request, { params: Promise.resolve({ appId }) });
  if (!response) throw new Error('Expected a response, got undefined');
  return response;
}

beforeEach(() => {
  fetchSingleAppQueryMock.mockReset();
  findGithubInstallationForAppMock.mockReset();
  deleteGithubInstallationForAppMock.mockReset();
  clearInstallationTokenCacheMock.mockReset();
  isAutoDeployEnabledMock.mockReset();
  disableAutoDeployMock.mockReset();
});

describe('GET /api/apps/[appId]/github', () => {
  it('reports autoDeployEnabled alongside the existing connection status', async () => {
    fetchSingleAppQueryMock.mockResolvedValue({ id: 5, name: 'demo' });
    findGithubInstallationForAppMock.mockResolvedValue({
      account_login: 'example',
      repo_full_name: 'example/demo',
      created_at: new Date().toISOString(),
    });
    isAutoDeployEnabledMock.mockResolvedValue(true);

    const response = await call(GET, new Request('https://example.com/api/apps/5/github'), '5');

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.connected).toBe(true);
    expect(payload.autoDeployEnabled).toBe(true);
  });
});

describe('DELETE /api/apps/[appId]/github', () => {
  it('disables auto_deploy when disconnecting, so a later reconnect cannot silently inherit it', async () => {
    findGithubInstallationForAppMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
    });

    const response = await call(
      DELETE,
      new Request('https://example.com/api/apps/5/github', { method: 'DELETE' }),
      '5'
    );

    expect(response.status).toBe(200);
    expect(deleteGithubInstallationForAppMock).toHaveBeenCalledWith(5);
    expect(disableAutoDeployMock).toHaveBeenCalledWith(5);
    expect(clearInstallationTokenCacheMock).toHaveBeenCalledWith(555);
  });

  it('still disables auto_deploy even when there was no installation to begin with (idempotent disconnect)', async () => {
    findGithubInstallationForAppMock.mockResolvedValue(null);

    const response = await call(
      DELETE,
      new Request('https://example.com/api/apps/5/github', { method: 'DELETE' }),
      '5'
    );

    expect(response.status).toBe(200);
    expect(disableAutoDeployMock).toHaveBeenCalledWith(5);
    expect(clearInstallationTokenCacheMock).not.toHaveBeenCalled();
  });

  it('disables auto_deploy BEFORE deleting the installation - a failed delete must not leave auto_deploy on', async () => {
    findGithubInstallationForAppMock.mockResolvedValue({ installation_id: '555', repo_id: '42' });

    await call(DELETE, new Request('https://example.com/api/apps/5/github', { method: 'DELETE' }), '5');

    const disableOrder = disableAutoDeployMock.mock.invocationCallOrder[0];
    const deleteOrder = deleteGithubInstallationForAppMock.mock.invocationCallOrder[0];
    expect(disableOrder).toBeLessThan(deleteOrder);
  });

  it('leaves auto_deploy disabled even if deleting the installation row then fails', async () => {
    findGithubInstallationForAppMock.mockResolvedValue({ installation_id: '555', repo_id: '42' });
    deleteGithubInstallationForAppMock.mockRejectedValue(new Error('db unreachable'));

    await expect(
      call(DELETE, new Request('https://example.com/api/apps/5/github', { method: 'DELETE' }), '5')
    ).rejects.toThrow('db unreachable');

    // The disable write already completed (and committed, being a separate query) before
    // the failing delete ran - the dangerous "disconnected but still auto-deploying" state
    // is what this ordering exists to prevent; "still connected but auto_deploy already
    // off" is the safe state left behind here instead.
    expect(disableAutoDeployMock).toHaveBeenCalledWith(5);
  });
});
