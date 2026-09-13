import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  poolQueryMock,
  prepareWorkspaceMock,
  resolveGitAuthMock,
  runReleasePipelineMock,
  updateDeploymentStatusMock,
} = vi.hoisted(() => ({
  poolQueryMock: vi.fn().mockResolvedValue({ rows: [] }),
  prepareWorkspaceMock: vi.fn().mockResolvedValue({ commitSha: 'abc1234' }),
  resolveGitAuthMock: vi.fn(),
  runReleasePipelineMock: vi.fn().mockResolvedValue({ containerId: 'container-1' }),
  updateDeploymentStatusMock: vi.fn(),
}));

vi.mock('~/services/database', () => ({ default: { query: poolQueryMock } }));
vi.mock('~/services/logger', () => ({
  default: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('~/services/docker', () => ({ stopContainer: vi.fn() }));
vi.mock('~/services/releasePipeline', () => ({ runReleasePipeline: runReleasePipelineMock }));
vi.mock('~/services/nginx', () => ({ updateNginxConfig: vi.fn() }));
vi.mock('~/services/cloudflare', () => ({
  default: { getChangedAssets: vi.fn().mockResolvedValue([]), purgeCache: vi.fn() },
}));
vi.mock('~/services/git', () => ({ prepareWorkspaceAtCommit: prepareWorkspaceMock }));
vi.mock('~/services/deploymentStatus', () => ({
  updateDeploymentStatus: updateDeploymentStatusMock,
  markDeploymentInactiveByContainerId: vi.fn(),
}));
vi.mock('~/services/previewBranches', () => ({ deployPreviewBranch: vi.fn() }));
vi.mock('~/services/resolveGitAuth', () => ({ resolveGitAuth: resolveGitAuthMock }));

import { executeDeployment } from './deploymentExecutor';
import { App } from '~/types';

const connectedApp: App = {
  id: 1,
  name: 'demo',
  repo_url: 'https://github.com/example/demo.git',
  branch: 'main',
  domain: 'demo.example.com',
  db_user: 'demo_user',
  db_password: 'demo_pass',
  db_name: 'demo_db',
  status: 'active',
};

beforeEach(() => {
  poolQueryMock.mockClear();
  prepareWorkspaceMock.mockClear();
  resolveGitAuthMock.mockReset();
  runReleasePipelineMock.mockClear();
  updateDeploymentStatusMock.mockClear();
});

describe('executeDeployment - GitHub credential wiring', () => {
  it('passes resolveGitAuth\'s result straight into prepareWorkspaceAtCommit - the same worker path every deploy uses', async () => {
    // Represents the deferred-clone scenario: a connected app whose checkout doesn't
    // exist yet gets its very first clone here, through the ordinary queue worker
    // (deployQueue.ts's runJob -> executeDeployment), not a separate code path triggered
    // by the connect callback or a settings request.
    const auth = {
      cloneUrl: 'https://x-access-token@github.com/example/demo.git',
      askpassPath: '/tmp/port-au-next-git-askpass.sh',
      token: 'ghs_livetoken123',
    };
    resolveGitAuthMock.mockResolvedValue(auth);

    await executeDeployment({
      app: connectedApp,
      job: { id: 1, branch: 'main', requested_sha: null },
      deploymentId: 10,
      isPreviewBranch: false,
      version: '20260101000000',
    });

    expect(resolveGitAuthMock).toHaveBeenCalledWith(connectedApp);
    expect(prepareWorkspaceMock).toHaveBeenCalledWith('demo', 'main', undefined, auth);
  });

  it('passes undefined auth through unchanged for an app with no GitHub connection', async () => {
    resolveGitAuthMock.mockResolvedValue(undefined);

    await executeDeployment({
      app: connectedApp,
      job: { id: 2, branch: 'main', requested_sha: null },
      deploymentId: 11,
      isPreviewBranch: false,
      version: '20260101000001',
    });

    expect(prepareWorkspaceMock).toHaveBeenCalledWith('demo', 'main', undefined, undefined);
  });
});
