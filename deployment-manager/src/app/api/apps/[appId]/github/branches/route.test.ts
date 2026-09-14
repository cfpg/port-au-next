import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fetchSingleAppQueryMock, findGithubInstallationForAppMock, listRepositoryBranchesMock } = vi.hoisted(() => ({
  fetchSingleAppQueryMock: vi.fn(),
  findGithubInstallationForAppMock: vi.fn(),
  listRepositoryBranchesMock: vi.fn(),
}));

vi.mock('~/lib/auth-utils', () => ({
  withAuth: (action: (...args: unknown[]) => unknown) => action,
}));
vi.mock('~/queries/fetchSingleAppQuery', () => ({ default: fetchSingleAppQueryMock }));
vi.mock('~/queries/githubInstallationsQuery', () => ({
  findGithubInstallationForApp: findGithubInstallationForAppMock,
}));
vi.mock('~/services/githubApp', () => ({
  listRepositoryBranches: listRepositoryBranchesMock,
}));

import { GET } from './route';

async function call(appId: string) {
  const response = await GET(new Request(`https://example.com/api/apps/${appId}/github/branches`), {
    params: Promise.resolve({ appId }),
  });
  if (!response) throw new Error('Expected a response, got undefined');
  return response;
}

beforeEach(() => {
  fetchSingleAppQueryMock.mockReset();
  findGithubInstallationForAppMock.mockReset();
  listRepositoryBranchesMock.mockReset();
});

describe('GET /api/apps/[appId]/github/branches', () => {
  it('returns connected: false with an empty list for an app with no GitHub installation', async () => {
    fetchSingleAppQueryMock.mockResolvedValue({ id: 5, name: 'demo', repo_url: 'https://github.com/example/demo.git' });
    findGithubInstallationForAppMock.mockResolvedValue(null);

    const response = await call('5');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false, branches: [] });
    expect(listRepositoryBranchesMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent app', async () => {
    fetchSingleAppQueryMock.mockResolvedValue(null);

    const response = await call('999');

    expect(response.status).toBe(404);
  });

  it('returns the branch list for a connected app whose repo_url still matches the installation', async () => {
    fetchSingleAppQueryMock.mockResolvedValue({ id: 5, name: 'demo', repo_url: 'https://github.com/example/demo.git' });
    findGithubInstallationForAppMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });
    listRepositoryBranchesMock.mockResolvedValue(['main', 'feature/foo']);

    const response = await call('5');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: true, branches: ['main', 'feature/foo'] });
    expect(listRepositoryBranchesMock).toHaveBeenCalledWith(555, 42, 'example/demo');
  });

  it('accepts an SSH repo_url that refers to the same repository the installation is connected for', async () => {
    fetchSingleAppQueryMock.mockResolvedValue({ id: 5, name: 'demo', repo_url: 'git@github.com:example/demo.git' });
    findGithubInstallationForAppMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });
    listRepositoryBranchesMock.mockResolvedValue(['main']);

    const response = await call('5');

    expect(response.status).toBe(200);
  });

  it('rejects with 409 when the app repo_url has diverged from the connected installation, without calling GitHub', async () => {
    fetchSingleAppQueryMock.mockResolvedValue({
      id: 5,
      name: 'demo',
      repo_url: 'https://github.com/example/a-different-repo.git',
    });
    findGithubInstallationForAppMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });

    const response = await call('5');

    expect(response.status).toBe(409);
    expect(listRepositoryBranchesMock).not.toHaveBeenCalled();
  });

  it('returns 502 when the GitHub API call fails', async () => {
    fetchSingleAppQueryMock.mockResolvedValue({ id: 5, name: 'demo', repo_url: 'https://github.com/example/demo.git' });
    findGithubInstallationForAppMock.mockResolvedValue({
      installation_id: '555',
      repo_id: '42',
      repo_full_name: 'example/demo',
    });
    listRepositoryBranchesMock.mockRejectedValue(new Error('GitHub API request failed: GET ... -> 401'));

    const response = await call('5');

    expect(response.status).toBe(502);
  });

  it('rejects a non-numeric app id', async () => {
    const response = await call('not-a-number');

    expect(response.status).toBe(400);
    expect(fetchSingleAppQueryMock).not.toHaveBeenCalled();
  });
});
