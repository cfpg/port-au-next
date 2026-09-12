import { describe, it, expect } from 'vitest';
import { mapDeploymentHistoryRow, DeploymentHistoryRow } from './deploymentHistoryRows';

function makeRow(overrides: Partial<DeploymentHistoryRow>): DeploymentHistoryRow {
  return {
    id: 1,
    app_id: 10,
    app_name: 'demo',
    app_repository: 'https://github.com/example/demo',
    version: '20260101000000',
    commit_id: 'abc1234',
    status: 'active',
    deployed_at: '2026-01-01T00:00:00.000Z',
    container_id: 'container-1',
    branch: 'main',
    is_queued: false,
    queue_job_id: null,
    queue_error: null,
    ...overrides,
  };
}

describe('mapDeploymentHistoryRow', () => {
  it('maps a real (linked) deployment row with isQueued false and no queue fields', () => {
    const mapped = mapDeploymentHistoryRow(makeRow({}));

    expect(mapped.isQueued).toBe(false);
    expect(mapped.queueJobId).toBeUndefined();
    expect(mapped.queueError).toBeUndefined();
    expect(mapped.id).toBe(1);
    expect(mapped.version).toBe('20260101000000');
  });

  it('maps a queued (not yet running) placeholder row', () => {
    const mapped = mapDeploymentHistoryRow(
      makeRow({
        id: -5,
        version: '',
        commit_id: null,
        status: 'queued',
        container_id: null,
        is_queued: true,
        queue_job_id: 5,
        queue_error: null,
      })
    );

    expect(mapped.isQueued).toBe(true);
    expect(mapped.queueJobId).toBe(5);
    expect(mapped.id).toBe(-5);
    expect(mapped.status).toBe('queued');
    expect(mapped.commit_id).toBeUndefined();
    // Placeholder id must never look like a usable deployment id to a consumer that
    // merely checks truthiness/type - it must be paired with isQueued, which callers are
    // expected to check before using `id` for any deployment-scoped action.
    expect(mapped.id).toBeLessThan(0);
  });

  it('maps a running-but-not-yet-linked placeholder row (worker claimed it, no deployment row yet)', () => {
    const mapped = mapDeploymentHistoryRow(
      makeRow({
        id: -7,
        version: '',
        status: 'building', // SQL side already resolves queue 'running' -> 'building' for display
        is_queued: true,
        queue_job_id: 7,
      })
    );

    expect(mapped.isQueued).toBe(true);
    expect(mapped.status).toBe('building');
  });

  it('maps an early-failed placeholder row (failed before a deployment row ever existed) with a redacted error', () => {
    const mapped = mapDeploymentHistoryRow(
      makeRow({
        id: -9,
        version: '',
        status: 'failed',
        is_queued: true,
        queue_job_id: 9,
        queue_error: 'Preview branches are not enabled for this app',
      })
    );

    expect(mapped.isQueued).toBe(true);
    expect(mapped.status).toBe('failed');
    expect(mapped.queueError).toBe('Preview branches are not enabled for this app');
  });

  it('converts a Date deployed_at to an ISO string, and passes a string through unchanged', () => {
    const asDate = mapDeploymentHistoryRow(makeRow({ deployed_at: new Date('2026-02-01T00:00:00.000Z') }));
    expect(asDate.deployed_at).toBe('2026-02-01T00:00:00.000Z');

    const asString = mapDeploymentHistoryRow(makeRow({ deployed_at: '2026-02-01T00:00:00.000Z' }));
    expect(asString.deployed_at).toBe('2026-02-01T00:00:00.000Z');
  });
});
