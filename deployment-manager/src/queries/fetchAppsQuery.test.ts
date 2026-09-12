import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('~/services/database', () => ({
  default: { query: queryMock },
}));

import fetchAppsQuery from './fetchAppsQuery';

beforeEach(() => {
  queryMock.mockReset();
});

function makeRow(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: 'demo',
    repo_url: 'https://github.com/example/demo',
    branch: 'main',
    domain: 'demo.example.com',
    db_name: 'demo_db',
    db_user: 'demo_user',
    db_password: 'secret',
    cloudflare_zone_id: null,
    root_path: null,
    env: {},
    deployment_status: null,
    last_deployment: null,
    deployment_deployed_at: null,
    next_queue_status: null,
    latest_queue_created_at: null,
    ...overrides,
  };
}

describe('fetchAppsQuery status precedence', () => {
  it('keeps the executing deployment status when the app also has a queued request', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        makeRow({
          deployment_status: 'building',
          deployment_deployed_at: '2026-01-01T00:00:00.000Z',
          next_queue_status: 'queued',
          latest_queue_created_at: '2026-01-01T00:05:00.000Z',
        }),
      ],
    });

    const [app] = await fetchAppsQuery();

    expect(app.status).toBe('building');
  });

  it('shows queued when the app has a waiting request and nothing executing', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        makeRow({
          deployment_status: 'active',
          deployment_deployed_at: '2026-01-01T00:00:00.000Z',
          last_deployment: { version: 'v1', commit_id: 'abc', status: 'active', deployed_at: '2026-01-01T00:00:00.000Z' },
          next_queue_status: 'queued',
          latest_queue_created_at: '2026-01-02T00:00:00.000Z',
        }),
      ],
    });

    const [app] = await fetchAppsQuery();

    expect(app.status).toBe('queued');
    // The real last deployment's own record must stay factual - a queued request must
    // never be reported as if it were already deployed.
    expect(app.last_deployment?.status).toBe('active');
    expect(app.last_deployment?.deployed_at).toBe('2026-01-01T00:00:00.000Z');
    expect(app.activity_at).toBe('2026-01-02T00:00:00.000Z');
  });

  it('shows building when the head-of-queue job has been claimed by the worker but not linked yet', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        makeRow({
          deployment_status: 'active',
          next_queue_status: 'running',
          latest_queue_created_at: '2026-01-02T00:00:00.000Z',
        }),
      ],
    });

    const [app] = await fetchAppsQuery();

    expect(app.status).toBe('building');
  });

  it('does not stay queued forever because of a failed job that never produced a deployment', async () => {
    // Regression: fetchAppsQuery must not feed a 'failed' queue status into the
    // outstanding-work check - the SQL's next_qj lateral already restricts to
    // queued/running, so a lingering failed job (e.g. from restart recovery) shows up as
    // null here and the app falls back to its real last deployment status instead of
    // reporting 'queued' indefinitely.
    queryMock.mockResolvedValueOnce({
      rows: [
        makeRow({
          deployment_status: 'active',
          deployment_deployed_at: '2026-01-01T00:00:00.000Z',
          last_deployment: { version: 'v1', commit_id: 'abc', status: 'active', deployed_at: '2026-01-01T00:00:00.000Z' },
          next_queue_status: null, // the failed job was already excluded upstream in SQL
          latest_queue_created_at: '2026-01-02T00:00:00.000Z', // but still counts as recent activity
        }),
      ],
    });

    const [app] = await fetchAppsQuery();

    expect(app.status).toBe('active');
    expect(app.activity_at).toBe('2026-01-02T00:00:00.000Z');
  });

  it('falls back to stopped with no deployment and no queue activity', async () => {
    queryMock.mockResolvedValueOnce({ rows: [makeRow({})] });

    const [app] = await fetchAppsQuery();

    expect(app.status).toBe('stopped');
    expect(app.activity_at).toBeNull();
  });

  it('sorts the most recently active app first, ahead of one only recently deployed', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        makeRow({
          id: 1,
          name: 'deployed-earlier',
          deployment_status: 'active',
          deployment_deployed_at: '2026-01-01T00:00:00.000Z',
        }),
        makeRow({
          id: 2,
          name: 'just-queued',
          next_queue_status: 'queued',
          latest_queue_created_at: '2026-01-02T00:00:00.000Z',
        }),
      ],
    });

    const apps = await fetchAppsQuery();

    expect(apps.map((a) => a.name)).toEqual(['just-queued', 'deployed-earlier']);
  });

  it('bumps activity from a fresh re-queue without changing which request is next in line', async () => {
    // Regression: app A already has an older outstanding request (job #10); a newer
    // request for A (job #12) is queued behind it. The FIFO-head status must still
    // reflect job #10 (whatever actually runs next), but activity_at must reflect the
    // fresh job #12 request so A's sidebar position moves as new activity comes in - not
    // get stuck showing the age of the request that's merely first in line.
    queryMock.mockResolvedValueOnce({
      rows: [
        makeRow({
          id: 1,
          name: 'app-a',
          deployment_status: null,
          next_queue_status: 'queued', // still job #10's status - FIFO order unaffected
          latest_queue_created_at: '2026-01-03T00:00:00.000Z', // job #12's created_at - the newer one
        }),
      ],
    });

    const [app] = await fetchAppsQuery();

    expect(app.status).toBe('queued');
    expect(app.activity_at).toBe('2026-01-03T00:00:00.000Z');
  });
});
