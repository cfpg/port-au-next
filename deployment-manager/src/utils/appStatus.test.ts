import { describe, it, expect } from 'vitest';
import { deriveAppStatus, deriveActivityAt, sortAppsByActivity } from './appStatus';
import { App } from '~/types';

describe('deriveAppStatus', () => {
  it('keeps an executing deployment status even when a request is queued behind it', () => {
    // "An executing deployment remains Building/Preflight/etc., even if another request
    // for that app is queued" - this is the precedence rule the Applications table relies
    // on to avoid implying a live deployment has stopped serving.
    expect(deriveAppStatus('building', 'queued')).toBe('building');
    expect(deriveAppStatus('preflight', 'running')).toBe('preflight');
    expect(deriveAppStatus('migrating', 'queued')).toBe('migrating');
    expect(deriveAppStatus('pending', 'running')).toBe('pending');
  });

  it('shows queued when nothing is executing but a request is waiting', () => {
    expect(deriveAppStatus('active', 'queued')).toBe('queued');
    expect(deriveAppStatus('inactive', 'queued')).toBe('queued');
    expect(deriveAppStatus(null, 'queued')).toBe('queued');
    expect(deriveAppStatus(undefined, 'queued')).toBe('queued');
  });

  it('shows building when the worker has claimed the head-of-queue request but not linked it yet', () => {
    // Matches Deployment History's own relabeling of an unlinked 'running' queue job.
    expect(deriveAppStatus('active', 'running')).toBe('building');
    expect(deriveAppStatus(null, 'running')).toBe('building');
  });

  it('does not count a failed request as outstanding work - it must not leave the app looking queued forever', () => {
    // A job that failed before ever producing a deployment row (e.g. during restart
    // recovery, or a validation failure) is not "waiting" - the caller is expected to
    // have already excluded 'failed' from what it passes here, but this documents that
    // only 'queued'/'running'/null are meaningful inputs, and confirms the fallback
    // behavior an app with only a failed request (no queued/running one) gets: its real
    // last-deployment status, not 'queued'.
    expect(deriveAppStatus('active', null)).toBe('active');
  });

  it('falls back to the last deployment status, or stopped, when nothing is queued', () => {
    expect(deriveAppStatus('active', null)).toBe('active');
    expect(deriveAppStatus(null, null)).toBe('stopped');
    expect(deriveAppStatus(undefined, null)).toBe('stopped');
  });
});

describe('deriveActivityAt', () => {
  it('picks the later of deployed_at and a queue request time', () => {
    const earlier = '2026-01-01T00:00:00.000Z';
    const later = '2026-01-02T00:00:00.000Z';
    expect(deriveActivityAt(earlier, later)).toBe(later);
    expect(deriveActivityAt(later, earlier)).toBe(later);
  });

  it('does not conflate a queued request with an actual deployment time', () => {
    // A brand-new app with no deployment yet, but a fresh queue request, should report
    // the request time as its activity - not silently stay null/undefined as if nothing
    // happened, and not be attributed to `last_deployment.deployed_at` (that stays
    // untouched elsewhere; this function only ever feeds a separate `activity_at` field).
    const queuedAt = '2026-01-01T00:00:00.000Z';
    expect(deriveActivityAt(null, queuedAt)).toBe(queuedAt);
    expect(deriveActivityAt(undefined, queuedAt)).toBe(queuedAt);
  });

  it('returns null when there is no deployment and no queue activity', () => {
    expect(deriveActivityAt(null, null)).toBeNull();
    expect(deriveActivityAt(undefined, undefined)).toBeNull();
  });

  it('accepts Date objects the same as ISO strings', () => {
    const earlier = new Date('2026-01-01T00:00:00.000Z');
    const later = new Date('2026-01-02T00:00:00.000Z');
    expect(deriveActivityAt(earlier, later)).toBe(later.toISOString());
  });
});

describe('sortAppsByActivity', () => {
  function makeApp(overrides: Partial<App>): App {
    return {
      id: 1,
      name: 'app',
      repo_url: 'https://github.com/example/app',
      branch: 'main',
      status: 'active',
      ...overrides,
    };
  }

  it('orders by most recent activity_at first, and does not mutate the input array', () => {
    const stale = makeApp({ id: 1, name: 'stale', activity_at: '2026-01-01T00:00:00.000Z' });
    const fresh = makeApp({ id: 2, name: 'fresh', activity_at: '2026-01-03T00:00:00.000Z' });
    const middle = makeApp({ id: 3, name: 'middle', activity_at: '2026-01-02T00:00:00.000Z' });
    const input = [stale, fresh, middle];

    const sorted = sortAppsByActivity(input);

    expect(sorted.map((a) => a.name)).toEqual(['fresh', 'middle', 'stale']);
    // Original array/order untouched.
    expect(input.map((a) => a.name)).toEqual(['stale', 'fresh', 'middle']);
  });

  it('a freshly queued app with no prior deployment sorts as newly active, ahead of stale apps', () => {
    // "A newly queued application should move as a newly started deployment would" - the
    // sidebar's ordering requirement, exercised here via the same shared comparator.
    const staleDeployed = makeApp({ id: 1, name: 'stale', activity_at: '2020-01-01T00:00:00.000Z' });
    const neverDeployedButQueued = makeApp({ id: 2, name: 'brand-new', activity_at: new Date().toISOString() });

    const sorted = sortAppsByActivity([staleDeployed, neverDeployedButQueued]);

    expect(sorted[0].name).toBe('brand-new');
  });

  it('pushes apps with no activity to the bottom, alphabetically among themselves', () => {
    const zeta = makeApp({ id: 1, name: 'zeta', activity_at: null });
    const alpha = makeApp({ id: 2, name: 'alpha', activity_at: null });
    const active = makeApp({ id: 3, name: 'active-one', activity_at: '2026-01-01T00:00:00.000Z' });

    const sorted = sortAppsByActivity([zeta, alpha, active]);

    expect(sorted.map((a) => a.name)).toEqual(['active-one', 'alpha', 'zeta']);
  });
});
