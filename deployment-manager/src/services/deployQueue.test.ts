import { describe, it, expect, vi, beforeEach } from 'vitest';

const { poolQueryMock, withTransactionMock, listOpenPullsByHeadMock } = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  withTransactionMock: vi.fn(),
  listOpenPullsByHeadMock: vi.fn(),
}));

vi.mock('~/services/database', () => ({
  default: { query: poolQueryMock },
  withTransaction: withTransactionMock,
}));
vi.mock('~/services/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    setDeploymentContext: vi.fn(),
    clearDeploymentContext: vi.fn(),
  },
}));
vi.mock('~/services/deploymentExecutor', () => ({ executeDeployment: vi.fn() }));
vi.mock('~/services/deploymentStatus', () => ({ updateDeploymentStatus: vi.fn() }));
vi.mock('~/services/previewBranches', () => ({
  ensurePreviewBranch: vi.fn(),
  deletePreviewBranch: vi.fn(),
  getPreviewBranch: vi.fn(),
}));
vi.mock('~/services/githubApp', () => ({
  listOpenPullsByHead: listOpenPullsByHeadMock,
}));

import { enqueueGithubPushEvent, enqueueGithubPullRequestEvent, enqueueManualDeployment, runJob } from './deployQueue';
import { AppFeature } from '~/types/appFeatures';
import { deletePreviewBranch, ensurePreviewBranch, getPreviewBranch } from '~/services/previewBranches';
import { executeDeployment } from '~/services/deploymentExecutor';

const ensurePreviewBranchMock = vi.mocked(ensurePreviewBranch);
const executeDeploymentMock = vi.mocked(executeDeployment);
const deletePreviewBranchMock = vi.mocked(deletePreviewBranch);
const getPreviewBranchMock = vi.mocked(getPreviewBranch);

/**
 * A fake transaction client that records every query issued through it and answers
 * eligibility/insert queries by inspecting the SQL text. This proves enqueueGithubPushEvent
 * issues exactly the queries/parameters it's supposed to and reads their results correctly -
 * it does NOT prove the real SQL actually filters/joins correctly against a real Postgres
 * schema (join semantics, the partial unique index's conflict behavior, real transaction
 * atomicity), which is out of reach for a mocked unit test and remains a manual/integration
 * verification item (see the final report).
 */
function makeFakeClient(candidateRows: unknown[], dedupedAppIds: Set<number> = new Set()) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('FROM apps a')) {
        return { rows: candidateRows };
      }
      if (sql.includes('INSERT INTO deploy_queue_jobs')) {
        const appId = (params as unknown[])[0] as number;
        if (dedupedAppIds.has(appId)) {
          return { rows: [] }; // ON CONFLICT ... DO NOTHING - no row returned
        }
        return { rows: [{ id: 1000 + appId }] };
      }
      if (sql.includes('Cancelled: pull request closed')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    }),
  };
  return { client, queries };
}

beforeEach(() => {
  poolQueryMock.mockReset();
  withTransactionMock.mockReset();
  ensurePreviewBranchMock.mockReset();
  executeDeploymentMock.mockReset();
  deletePreviewBranchMock.mockReset();
  getPreviewBranchMock.mockReset();
  listOpenPullsByHeadMock.mockReset();
});

describe('enqueueGithubPushEvent', () => {
  it('queries eligibility filtered by BOTH installation_id and repo_id, and inserts a webhook job with the exact requested SHA', async () => {
    const candidate = {
      id: 1,
      branch: 'main',
      repo_url: 'https://github.com/example/demo.git',
      preview_domain: null,
      repo_full_name: 'example/demo',
      auto_deploy_enabled: true,
      previews_enabled: false,
    };
    const { client, queries } = makeFakeClient([candidate]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPushEvent({
      installationId: 555,
      repoId: 42,
      branch: 'main',
      sha: 'a'.repeat(40),
      deliveryId: 'delivery-1',
    });

    expect(result).toEqual({ eligibleAppIds: [1], insertedJobIds: [1001] });

    const eligibilityQuery = queries.find((q) => q.sql.includes('FROM apps a'));
    expect(eligibilityQuery?.params).toEqual([AppFeature.AUTO_DEPLOY, AppFeature.PREVIEW_BRANCHES, 555, 42, 'main']);

    const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO deploy_queue_jobs'));
    expect(insertQuery?.params).toEqual([1, 'main', 'a'.repeat(40), 555, 42, 'delivery-1', 'deploy', null]);
    expect(insertQuery?.sql).toContain("ON CONFLICT (app_id, github_delivery_id) WHERE github_delivery_id IS NOT NULL DO NOTHING");
  });

  it('enqueues a job for every eligible app when more than one app is connected to the same installation+repo', async () => {
    const candidates = [
      { id: 1, branch: 'main', repo_url: 'https://github.com/example/demo.git', preview_domain: null, repo_full_name: 'example/demo', auto_deploy_enabled: true, previews_enabled: false },
      { id: 2, branch: 'main', repo_url: 'https://github.com/example/demo.git', preview_domain: null, repo_full_name: 'example/demo', auto_deploy_enabled: true, previews_enabled: false },
    ];
    const { client } = makeFakeClient(candidates);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPushEvent({
      installationId: 555,
      repoId: 42,
      branch: 'main',
      sha: 'a'.repeat(40),
      deliveryId: 'delivery-1',
    });

    expect(result.eligibleAppIds.sort()).toEqual([1, 2]);
    expect(result.insertedJobIds.sort()).toEqual([1001, 1002]);
  });

  it('skips a candidate whose repo_url no longer matches the connected installation', async () => {
    const candidate = {
      id: 1,
      branch: 'main',
      repo_url: 'https://github.com/example/a-different-repo.git',
      preview_domain: null,
      repo_full_name: 'example/demo', // installation is still connected to "demo", not the app's current repo_url
      auto_deploy_enabled: true,
      previews_enabled: false,
    };
    const { client } = makeFakeClient([candidate]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPushEvent({
      installationId: 555,
      repoId: 42,
      branch: 'main',
      sha: 'a'.repeat(40),
      deliveryId: 'delivery-1',
    });

    expect(result).toEqual({ eligibleAppIds: [], insertedJobIds: [] });
  });

  it('does not enqueue a preview-branch push when Preview Branches is disabled or has no domain configured', async () => {
    const candidates = [
      { id: 1, branch: 'main', repo_url: 'https://github.com/example/demo.git', preview_domain: null, repo_full_name: 'example/demo', auto_deploy_enabled: true, previews_enabled: false },
      { id: 2, branch: 'main', repo_url: 'https://github.com/example/demo.git', preview_domain: null, repo_full_name: 'example/demo', auto_deploy_enabled: true, previews_enabled: true }, // enabled but no domain
    ];
    const { client } = makeFakeClient(candidates);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPushEvent({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo', // not the app's production branch
      sha: 'a'.repeat(40),
      deliveryId: 'delivery-1',
    });

    expect(result).toEqual({
      eligibleAppIds: [],
      insertedJobIds: [],
      ignoredReason: 'preview_requires_pull_request',
    });
  });

  it('does not enqueue a preview-branch push even when Preview Branches is enabled with a domain configured', async () => {
    const candidate = {
      id: 1,
      branch: 'main',
      repo_url: 'https://github.com/example/demo.git',
      preview_domain: 'preview.example.com',
      repo_full_name: 'example/demo',
      auto_deploy_enabled: true,
      previews_enabled: true,
    };
    const { client, queries } = makeFakeClient([candidate]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPushEvent({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo',
      sha: 'b'.repeat(40),
      deliveryId: 'delivery-2',
    });

    expect(result).toEqual({
      eligibleAppIds: [],
      insertedJobIds: [],
      ignoredReason: 'preview_requires_pull_request',
    });
    expect(queries.some((q) => q.sql.includes('INSERT INTO deploy_queue_jobs'))).toBe(false);
  });

  it('counts a deduplicated (ON CONFLICT DO NOTHING) app as eligible but not inserted', async () => {
    const candidate = {
      id: 1,
      branch: 'main',
      repo_url: 'https://github.com/example/demo.git',
      preview_domain: null,
      repo_full_name: 'example/demo',
      auto_deploy_enabled: true,
      previews_enabled: false,
    };
    const { client } = makeFakeClient([candidate], new Set([1]));
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPushEvent({
      installationId: 555,
      repoId: 42,
      branch: 'main',
      sha: 'a'.repeat(40),
      deliveryId: 'already-delivered',
    });

    expect(result).toEqual({ eligibleAppIds: [1], insertedJobIds: [] });
  });

  it('rejects (no partial acceptance) when the transaction callback throws partway through', async () => {
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => {
      // Mirrors withTransaction's real contract (database.ts): a thrown error from inside
      // the callback propagates out of withTransaction itself (real code additionally rolls
      // back on this path - not re-verified here, that requires a real Postgres connection).
      return callback({
        query: vi.fn().mockRejectedValue(new Error('db exploded')),
      });
    });

    await expect(
      enqueueGithubPushEvent({
        installationId: 555,
        repoId: 42,
        branch: 'main',
        sha: 'a'.repeat(40),
        deliveryId: 'delivery-1',
      })
    ).rejects.toThrow('db exploded');
  });

  it('does everything inside the one transaction client - never falls back to a direct pool query', async () => {
    const candidate = {
      id: 1,
      branch: 'main',
      repo_url: 'https://github.com/example/demo.git',
      preview_domain: null,
      repo_full_name: 'example/demo',
      auto_deploy_enabled: true,
      previews_enabled: false,
    };
    const { client } = makeFakeClient([candidate]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    await enqueueGithubPushEvent({
      installationId: 555,
      repoId: 42,
      branch: 'main',
      sha: 'a'.repeat(40),
      deliveryId: 'delivery-1',
    });

    expect(withTransactionMock).toHaveBeenCalledTimes(1);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});

describe('enqueueGithubPullRequestEvent', () => {
  const previewCandidate = {
    id: 1,
    branch: 'main',
    repo_url: 'https://github.com/example/demo.git',
    preview_domain: 'preview.example.com',
    repo_full_name: 'example/demo',
    auto_deploy_enabled: true,
    previews_enabled: true,
    has_live_preview: false,
  };

  it('enqueues a preview deploy for an opened PR when auto-deploy and preview branches are enabled', async () => {
    const { client, queries } = makeFakeClient([previewCandidate]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPullRequestEvent({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo',
      sha: 'b'.repeat(40),
      deliveryId: 'pr-delivery-1',
      prNumber: 12,
      kind: 'deploy',
    });

    expect(result).toEqual({ eligibleAppIds: [1], insertedJobIds: [1001] });
    const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO deploy_queue_jobs'));
    expect(insertQuery?.params).toEqual([
      1,
      'feature/foo',
      'b'.repeat(40),
      555,
      42,
      'pr-delivery-1',
      'deploy',
      12,
    ]);
    expect(queries.some((q) => q.sql.includes('Cancelled: pull request closed'))).toBe(false);
  });

  it('does not enqueue a preview deploy when Preview Branches is off', async () => {
    const { client } = makeFakeClient([{ ...previewCandidate, previews_enabled: false }]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPullRequestEvent({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo',
      sha: 'b'.repeat(40),
      deliveryId: 'pr-delivery-1',
      prNumber: 12,
      kind: 'deploy',
    });

    expect(result).toEqual({ eligibleAppIds: [], insertedJobIds: [] });
  });

  it('does not enqueue a preview deploy when the head branch is the app production branch', async () => {
    const { client, queries } = makeFakeClient([previewCandidate]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPullRequestEvent({
      installationId: 555,
      repoId: 42,
      branch: 'main',
      sha: 'b'.repeat(40),
      deliveryId: 'pr-delivery-1',
      prNumber: 12,
      kind: 'deploy',
    });

    expect(result).toEqual({ eligibleAppIds: [], insertedJobIds: [] });
    expect(queries.some((q) => q.sql.includes('INSERT INTO deploy_queue_jobs'))).toBe(false);
  });

  it('enqueues a teardown when a live preview exists, even if auto-deploy is off, and cancels queued deploys', async () => {
    const { client, queries } = makeFakeClient([
      { ...previewCandidate, auto_deploy_enabled: false, has_live_preview: true },
    ]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPullRequestEvent({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo',
      sha: 'b'.repeat(40),
      deliveryId: 'pr-close-1',
      prNumber: 12,
      kind: 'teardown',
    });

    expect(result).toEqual({ eligibleAppIds: [1], insertedJobIds: [1001] });
    const insertQuery = queries.find((q) => q.sql.includes('INSERT INTO deploy_queue_jobs'));
    expect(insertQuery?.params[6]).toBe('teardown');
    expect(insertQuery?.params[2]).toBeNull();
    expect(queries.some((q) => q.sql.includes('Cancelled: pull request closed'))).toBe(true);
  });

  it('does not cancel queued deploys when the teardown insert is a duplicate delivery', async () => {
    const { client, queries } = makeFakeClient(
      [{ ...previewCandidate, has_live_preview: true }],
      new Set([1])
    );
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPullRequestEvent({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo',
      sha: 'b'.repeat(40),
      deliveryId: 'already-closed',
      prNumber: 12,
      kind: 'teardown',
    });

    expect(result).toEqual({ eligibleAppIds: [1], insertedJobIds: [] });
    expect(queries.some((q) => q.sql.includes('Cancelled: pull request closed'))).toBe(false);
  });

  it('does not enqueue teardown when there is no live preview row', async () => {
    const { client } = makeFakeClient([{ ...previewCandidate, has_live_preview: false }]);
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) => callback(client));

    const result = await enqueueGithubPullRequestEvent({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo',
      sha: 'b'.repeat(40),
      deliveryId: 'pr-close-1',
      prNumber: 12,
      kind: 'teardown',
    });

    expect(result).toEqual({ eligibleAppIds: [], insertedJobIds: [] });
  });
});

describe('enqueueManualDeployment - unaffected by the webhook path', () => {
  it('still inserts a manual job with no installation/repo identity, unaffected by the webhook eligibility logic', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] }) // no existing queued/running job for this app+branch
      .mockResolvedValueOnce({ rows: [{ id: 55 }] }); // the INSERT

    const result = await enqueueManualDeployment(1, 'user-1', 'main', false);

    expect(result).toEqual({ queueJobId: 55 });
    const insertCall = poolQueryMock.mock.calls[1];
    expect(insertCall[0]).toContain("'manual'");
    expect(insertCall[1]).toEqual([1, 'main', 'user-1']);
  });
});

describe('runJob - webhook connection re-check before preview provisioning', () => {
  it('rejects a webhook job whose connection changed BEFORE calling ensurePreviewBranch or executeDeployment', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        return { rows: [{ id: 1, name: 'demo', branch: 'main' }] };
      }
      if (sql.includes('FROM github_installations')) {
        // Installation now points at a DIFFERENT installation than the job was queued
        // against (555 -> 999) - e.g. disconnected and reconnected while this job waited.
        return { rows: [{ installation_id: '999', repo_id: '42', account_login: 'x', repo_full_name: 'example/demo' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'failed'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });

    const job = {
      id: 10,
      app_id: 1,
      source: 'webhook' as const,
      branch: 'feature/foo', // != app.branch ('main') - this would be a preview deploy
      requested_sha: 'a'.repeat(40),
      requested_by_user_id: null,
      installation_id: '555',
      repo_id: '42',
      github_delivery_id: 'delivery-1',
    };

    await runJob(job);

    expect(ensurePreviewBranchMock).not.toHaveBeenCalled();
    expect(executeDeploymentMock).not.toHaveBeenCalled();
    expect(withTransactionMock).not.toHaveBeenCalled(); // no deployments row created either

    const failureUpdate = poolQueryMock.mock.calls.find(([sql]) => sql.includes("status = 'failed'"));
    expect(failureUpdate?.[1][0]).toContain('connection has since changed');
  });

  it('rejects a webhook job BEFORE preview provisioning when only the app repo_url has diverged (installation/repo ids still match)', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        // The app's repo_url was edited to point elsewhere while this job sat queued -
        // installation_id/repo_id on the job still match the connection exactly.
        return {
          rows: [{ id: 1, name: 'demo', branch: 'main', repo_url: 'https://github.com/example/a-different-repo.git' }],
        };
      }
      if (sql.includes('FROM github_installations')) {
        return { rows: [{ installation_id: '555', repo_id: '42', account_login: 'x', repo_full_name: 'example/demo' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'failed'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });

    const job = {
      id: 13,
      app_id: 1,
      source: 'webhook' as const,
      branch: 'feature/foo',
      requested_sha: 'c'.repeat(40),
      requested_by_user_id: null,
      installation_id: '555',
      repo_id: '42',
      github_delivery_id: 'delivery-3',
    };

    await runJob(job);

    expect(ensurePreviewBranchMock).not.toHaveBeenCalled();
    expect(executeDeploymentMock).not.toHaveBeenCalled();
    expect(withTransactionMock).not.toHaveBeenCalled();

    const failureUpdate = poolQueryMock.mock.calls.find(([sql]) => sql.includes("status = 'failed'"));
    expect(failureUpdate?.[1][0]).toContain('no longer matches');
  });

  it('still provisions the preview branch and deploys when the webhook connection is unchanged', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        return {
          rows: [{ id: 1, name: 'demo', branch: 'main', repo_url: 'https://github.com/example/demo.git' }],
        };
      }
      if (sql.includes('FROM github_installations')) {
        return { rows: [{ installation_id: '555', repo_id: '42', account_login: 'x', repo_full_name: 'example/demo' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET deployment_id")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'done'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });
    ensurePreviewBranchMock.mockResolvedValue({ id: 77 });
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) =>
      callback({ query: vi.fn().mockResolvedValue({ rows: [{ id: 555 }] }) })
    );
    executeDeploymentMock.mockResolvedValue(undefined);

    const job = {
      id: 11,
      app_id: 1,
      source: 'webhook' as const,
      branch: 'feature/foo',
      requested_sha: 'b'.repeat(40),
      requested_by_user_id: null,
      installation_id: '555',
      repo_id: '42',
      github_delivery_id: 'delivery-2',
    };

    await runJob(job);

    expect(ensurePreviewBranchMock).toHaveBeenCalledTimes(1);
    expect(executeDeploymentMock).toHaveBeenCalledTimes(1);
  });

  it('does not require the connection check for a manual job', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        return { rows: [{ id: 1, name: 'demo', branch: 'main' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'done'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });
    withTransactionMock.mockImplementation(async (callback: (c: unknown) => Promise<unknown>) =>
      callback({ query: vi.fn().mockResolvedValue({ rows: [{ id: 555 }] }) })
    );
    executeDeploymentMock.mockResolvedValue(undefined);

    const job = {
      id: 12,
      app_id: 1,
      source: 'manual' as const,
      branch: 'main', // production branch - not a preview
      requested_sha: null,
      requested_by_user_id: 'user-1',
      installation_id: null,
      repo_id: null,
      github_delivery_id: null,
    };

    await runJob(job);

    // No github_installations lookup should happen at all for a manual job.
    expect(poolQueryMock.mock.calls.some(([sql]) => sql.includes('FROM github_installations'))).toBe(false);
    expect(ensurePreviewBranchMock).not.toHaveBeenCalled();
    expect(executeDeploymentMock).toHaveBeenCalledTimes(1);
  });

  it('tears down a preview when no other open PR shares the head branch', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        return {
          rows: [{ id: 1, name: 'demo', branch: 'main', repo_url: 'https://github.com/example/demo.git' }],
        };
      }
      if (sql.includes('FROM github_installations')) {
        return { rows: [{ installation_id: '555', repo_id: '42', account_login: 'x', repo_full_name: 'example/demo' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'done'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });
    getPreviewBranchMock.mockResolvedValue({ id: 77, deleted_at: null });
    listOpenPullsByHeadMock.mockResolvedValue([{ number: 12 }]);
    deletePreviewBranchMock.mockResolvedValue(undefined);

    const job = {
      id: 30,
      app_id: 1,
      source: 'webhook' as const,
      branch: 'feature/foo',
      requested_sha: null,
      requested_by_user_id: null,
      installation_id: '555',
      repo_id: '42',
      github_delivery_id: 'pr-close-1',
      job_kind: 'teardown' as const,
      github_pr_number: 12,
    };

    await runJob(job);

    expect(listOpenPullsByHeadMock).toHaveBeenCalledWith(555, 42, 'example/demo', 'feature/foo');
    expect(deletePreviewBranchMock).toHaveBeenCalledWith(1, 'feature/foo', { skipActiveJobCheck: true });
    expect(ensurePreviewBranchMock).not.toHaveBeenCalled();
    expect(executeDeploymentMock).not.toHaveBeenCalled();
  });

  it('skips destroy when another open PR still uses the head branch', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        return {
          rows: [{ id: 1, name: 'demo', branch: 'main', repo_url: 'https://github.com/example/demo.git' }],
        };
      }
      if (sql.includes('FROM github_installations')) {
        return { rows: [{ installation_id: '555', repo_id: '42', account_login: 'x', repo_full_name: 'example/demo' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'done'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });
    getPreviewBranchMock.mockResolvedValue({ id: 77, deleted_at: null });
    listOpenPullsByHeadMock.mockResolvedValue([{ number: 12 }, { number: 99 }]);

    const job = {
      id: 31,
      app_id: 1,
      source: 'webhook' as const,
      branch: 'feature/foo',
      requested_sha: null,
      requested_by_user_id: null,
      installation_id: '555',
      repo_id: '42',
      github_delivery_id: 'pr-close-2',
      job_kind: 'teardown' as const,
      github_pr_number: 12,
    };

    await runJob(job);

    expect(deletePreviewBranchMock).not.toHaveBeenCalled();
    expect(executeDeploymentMock).not.toHaveBeenCalled();
  });

  it('fails the teardown job without destroying when listing open PRs fails', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        return {
          rows: [{ id: 1, name: 'demo', branch: 'main', repo_url: 'https://github.com/example/demo.git' }],
        };
      }
      if (sql.includes('FROM github_installations')) {
        return { rows: [{ installation_id: '555', repo_id: '42', account_login: 'x', repo_full_name: 'example/demo' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'failed'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });
    getPreviewBranchMock.mockResolvedValue({ id: 77, deleted_at: null });
    listOpenPullsByHeadMock.mockRejectedValue(new Error('GitHub API request failed: GET ... -> 403'));

    const job = {
      id: 32,
      app_id: 1,
      source: 'webhook' as const,
      branch: 'feature/foo',
      requested_sha: null,
      requested_by_user_id: null,
      installation_id: '555',
      repo_id: '42',
      github_delivery_id: 'pr-close-3',
      job_kind: 'teardown' as const,
      github_pr_number: 12,
    };

    await runJob(job);

    expect(deletePreviewBranchMock).not.toHaveBeenCalled();
    const failureUpdate = poolQueryMock.mock.calls.find(([sql]) => sql.includes("status = 'failed'"));
    expect(failureUpdate?.[1][0]).toContain('GitHub API request failed');
  });

  it('marks teardown done without destroying when the preview row is already gone', async () => {
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM apps WHERE id')) {
        return {
          rows: [{ id: 1, name: 'demo', branch: 'main', repo_url: 'https://github.com/example/demo.git' }],
        };
      }
      if (sql.includes('FROM github_installations')) {
        return { rows: [{ installation_id: '555', repo_id: '42', account_login: 'x', repo_full_name: 'example/demo' }] };
      }
      if (sql.includes("UPDATE deploy_queue_jobs SET status = 'done'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    });
    getPreviewBranchMock.mockResolvedValue(null);

    const job = {
      id: 33,
      app_id: 1,
      source: 'webhook' as const,
      branch: 'feature/foo',
      requested_sha: null,
      requested_by_user_id: null,
      installation_id: '555',
      repo_id: '42',
      github_delivery_id: 'pr-close-4',
      job_kind: 'teardown' as const,
      github_pr_number: 12,
    };

    await runJob(job);

    expect(listOpenPullsByHeadMock).not.toHaveBeenCalled();
    expect(deletePreviewBranchMock).not.toHaveBeenCalled();
  });
});
