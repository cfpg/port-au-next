import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('~/services/database', () => ({
  default: { query: queryMock },
}));

// Imported after the mock is registered so the module under test picks up the mocked pool.
import fetchRecentDeploymentsQuery from './fetchRecentDeploymentsQuery';

beforeEach(() => {
  queryMock.mockReset();
});

describe('fetchRecentDeploymentsQuery', () => {
  it('issues exactly one query for the combined history - not a separate deployments read plus a separate queue read', async () => {
    // This is the structural guarantee behind "the worker links a job to its new
    // deployments row in one transaction, so a request must be represented exactly once
    // regardless of when that transaction lands relative to this read." Two sequential
    // pool.query calls would mean two snapshots and a race window; one call means one
    // consistent snapshot.
    queryMock.mockResolvedValueOnce({ rows: [] });

    await fetchRecentDeploymentsQuery(42);

    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('passes appId, limit, and offset as query parameters when scoped to one app', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await fetchRecentDeploymentsQuery(42, { limit: 5, page: 2 });

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([42, 5, 5]); // offset = (page - 1) * limit = (2-1)*5
  });

  it('passes only limit and offset when not scoped to an app', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await fetchRecentDeploymentsQuery(undefined, { limit: 10, page: 1 });

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([10, 0]);
  });

  it('maps a mix of linked deployments, queued, running-unlinked, and early-failed rows without dropping or duplicating any', async () => {
    // Simulates one snapshot containing every state at once - the exact mix the combined
    // query can legitimately return for a busy app.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 101,
          app_id: 1,
          app_name: 'demo',
          app_repository: 'https://github.com/example/demo',
          version: '20260101000000',
          commit_id: 'deadbee',
          status: 'active',
          deployed_at: '2026-01-01T00:00:00.000Z',
          container_id: 'c-1',
          branch: 'main',
          is_queued: false,
          queue_job_id: null,
          queue_error: null,
        },
        {
          id: -5,
          app_id: 2,
          app_name: 'other',
          app_repository: 'https://github.com/example/other',
          version: '',
          commit_id: null,
          status: 'queued',
          deployed_at: '2026-01-02T00:00:00.000Z',
          container_id: null,
          branch: 'main',
          is_queued: true,
          queue_job_id: 5,
          queue_error: null,
        },
        {
          id: -6,
          app_id: 2,
          app_name: 'other',
          app_repository: 'https://github.com/example/other',
          version: '',
          commit_id: null,
          status: 'building',
          deployed_at: '2026-01-03T00:00:00.000Z',
          container_id: null,
          branch: 'feature-x',
          is_queued: true,
          queue_job_id: 6,
          queue_error: null,
        },
        {
          id: -7,
          app_id: 3,
          app_name: 'broken',
          app_repository: 'https://github.com/example/broken',
          version: '',
          commit_id: null,
          status: 'failed',
          deployed_at: '2026-01-04T00:00:00.000Z',
          container_id: null,
          branch: 'main',
          is_queued: true,
          queue_job_id: 7,
          queue_error: 'App has no database configured',
        },
      ],
    });

    const result = await fetchRecentDeploymentsQuery();

    expect(result).toHaveLength(4);
    expect(result.map((d) => d.id)).toEqual([101, -5, -6, -7]);
    expect(result.find((d) => d.queueJobId === 5)?.status).toBe('queued');
    expect(result.find((d) => d.queueJobId === 6)?.status).toBe('building');
    expect(result.find((d) => d.queueJobId === 7)?.status).toBe('failed');
    expect(result.find((d) => d.queueJobId === 7)?.queueError).toBe('App has no database configured');
    expect(result.find((d) => d.id === 101)?.isQueued).toBe(false);
  });

  it('does not re-slice or re-merge results in JS - pagination is whatever the single query returned', async () => {
    // Regression guard for "placeholders merged into an already-paginated list, then
    // truncated again": the function must return exactly what the (mocked) query
    // produced, even when that's more rows than the default page size, proving there is
    // no second, JS-side .slice(0, limit) left over from the old two-query design.
    const manyRows = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      app_id: 1,
      app_name: 'demo',
      app_repository: 'https://github.com/example/demo',
      version: 'v',
      commit_id: null,
      status: 'active',
      deployed_at: new Date(2026, 0, i + 1).toISOString(),
      container_id: null,
      branch: 'main',
      is_queued: false,
      queue_job_id: null,
      queue_error: null,
    }));
    queryMock.mockResolvedValueOnce({ rows: manyRows });

    const result = await fetchRecentDeploymentsQuery(1, { limit: 10, page: 1 });

    expect(result).toHaveLength(15);
  });
});
