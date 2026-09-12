import { App } from '~/types';

/**
 * Deployment statuses that mean "actively executing" - an app in one of these states keeps
 * showing it even if a separate request for the same app is sitting in the queue behind it.
 */
export const IN_PROGRESS_DEPLOYMENT_STATUSES = new Set([
  'pending',
  'building',
  'preflight',
  'migrating',
]);

/**
 * Precedence for the Applications table's status column: an executing deployment always
 * wins (a queued request behind it doesn't make the app look like it stopped serving);
 * only when nothing is executing does the FIFO-head outstanding request surface, as
 * 'building' if the worker has already claimed it (unlinked 'running' - matches the
 * Deployment History table's own relabeling of that same state) or 'queued' otherwise;
 * failing that, fall back to the last deployment's own status.
 *
 * `nextQueueStatus` must already be restricted to 'queued'/'running' by the caller - a
 * `failed` job is not outstanding work and must never make an app look queued forever.
 */
export function deriveAppStatus(
  deploymentStatus: string | null | undefined,
  nextQueueStatus: 'queued' | 'running' | null | undefined
): string {
  if (deploymentStatus && IN_PROGRESS_DEPLOYMENT_STATUSES.has(deploymentStatus)) {
    return deploymentStatus;
  }
  if (nextQueueStatus === 'running') {
    return 'building';
  }
  if (nextQueueStatus === 'queued') {
    return 'queued';
  }
  return deploymentStatus ?? 'stopped';
}

/**
 * The later of "last deployed" and "last queue request", for ordering only (e.g. the
 * sidebar) - never written back onto `last_deployment.deployed_at`, which must keep
 * reporting the real deployment time so a queued-but-not-yet-run request isn't shown as
 * already deployed.
 */
export function deriveActivityAt(
  deployedAt: string | Date | null | undefined,
  queueCreatedAt: string | Date | null | undefined
): string | null {
  const times = [deployedAt, queueCreatedAt]
    .filter((value): value is string | Date => value != null)
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time));

  if (times.length === 0) {
    return null;
  }

  return new Date(Math.max(...times)).toISOString();
}

/**
 * Most-recently-active app first (deploy OR queue request), apps with neither pushed to
 * the bottom, name as a stable tiebreaker - extends the existing "most recently deployed
 * first" ordering to also count a fresh queue request as activity, without mutating any
 * app's own `activity_at` in place (pass a derived array, not `apps` itself, if you also
 * need the un-sorted list elsewhere).
 */
export function sortAppsByActivity(apps: App[]): App[] {
  return [...apps].sort((a, b) => {
    const aTime = a.activity_at ? new Date(a.activity_at).getTime() : null;
    const bTime = b.activity_at ? new Date(b.activity_at).getTime() : null;

    if (aTime === null && bTime === null) return a.name.localeCompare(b.name);
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    if (aTime !== bTime) return bTime - aTime;
    return a.name.localeCompare(b.name);
  });
}
