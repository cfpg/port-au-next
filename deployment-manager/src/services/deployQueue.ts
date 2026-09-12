import pool, { withTransaction } from '~/services/database';
import logger from '~/services/logger';
import { executeDeployment } from '~/services/deploymentExecutor';
import { updateDeploymentStatus } from '~/services/deploymentStatus';
import { ensurePreviewBranch } from '~/services/previewBranches';
import { redactLogText } from '~/lib/redactLogs';

interface DeployQueueJob {
  id: number;
  app_id: number;
  source: 'manual' | 'webhook';
  branch: string;
  requested_sha: string | null;
  requested_by_user_id: string | null;
  installation_id: string | null;
  github_delivery_id: string | null;
}

export interface EnqueueManualDeploymentResult {
  queueJobId?: number;
  requiresConfirmation?: true;
}

// Every deployment - manual or (in a later phase) webhook-triggered - runs through this
// single queue and worker. See docs/SOW-github-autodeploy.md: this is what makes "only one
// deployment runs at a time" true by construction instead of by convention, and is why the
// old fire-and-forget dashboard action and its logger/redaction singleton mutation are safe
// now - there is exactly one place that ever calls executeDeployment().
//
// State is stashed on globalThis so it survives this module being re-evaluated more than
// once in the same process (dev/HMR, or a bundler splitting it into more than one chunk) -
// a second copy of `draining`/`systemReady` would silently defeat the single-worker guarantee.
const GLOBAL_KEY = '__portAuNextDeployQueueState__';

interface QueueState {
  draining: boolean;
  systemReady: boolean;
  timer: ReturnType<typeof setInterval> | null;
}

function getState(): QueueState {
  const g = globalThis as unknown as { [GLOBAL_KEY]?: QueueState };
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { draining: false, systemReady: false, timer: null };
  }
  return g[GLOBAL_KEY];
}

/**
 * Called once at startup, after container recovery AND queue-job recovery have both
 * genuinely completed without throwing (see instrumentation.ts) - not merely "the step
 * was reached." Until this is called, kick() and the periodic timer are no-ops: requests
 * can still enqueue (nothing is lost), but nothing executes.
 */
export function markSystemReady(): void {
  const state = getState();
  state.systemReady = true;
  if (!state.timer) {
    // Backstop: recovers from a missed kick (e.g. a transient failure) without needing
    // another push/click to arrive.
    state.timer = setInterval(() => kick(), 30_000);
  }
  kick();
}

export function kick(): void {
  const state = getState();
  if (state.draining || !state.systemReady) {
    return;
  }
  void drainQueue().catch((err) => {
    logger.error('drainQueue crashed', err instanceof Error ? err : new Error(String(err)));
  });
}

async function claimNextJob(): Promise<DeployQueueJob | null> {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, app_id, source, branch, requested_sha, requested_by_user_id, installation_id, github_delivery_id
       FROM deploy_queue_jobs
       WHERE status = 'queued'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );
    const job = result.rows[0] as DeployQueueJob | undefined;
    if (!job) {
      return null;
    }

    await client.query(
      `UPDATE deploy_queue_jobs SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [job.id]
    );

    return job;
  });
}

async function createDeploymentRow(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ id: number }> }> },
  appId: number,
  branch: string,
  isPreviewBranch: boolean,
  previewBranchId: number | null,
  version: string
): Promise<number> {
  const result = await client.query(
    `INSERT INTO deployments (app_id, version, status, branch, is_preview, preview_branch_id)
     VALUES ($1, $2, 'pending', $3, $4, $5)
     RETURNING id`,
    [appId, version, branch, isPreviewBranch, previewBranchId]
  );
  return result.rows[0].id;
}

async function fetchApp(appId: number) {
  const result = await pool.query('SELECT * FROM apps WHERE id = $1', [appId]);
  if (result.rows.length === 0) {
    throw new Error(`App ${appId} not found`);
  }
  return result.rows[0];
}

async function runJob(job: DeployQueueJob): Promise<void> {
  // Tracked outside the try so the catch block can mark the deployment itself failed, not
  // just the queue row - without this, a build/git/readiness failure left the deployment
  // stuck at 'building'/'preflight' forever (only a restart's recovery pass would touch it).
  let deploymentId: number | undefined;

  try {
    const app = await fetchApp(job.app_id);
    const isPreviewBranch = job.branch !== app.branch;
    const version = new Date().toISOString().replace(/[^0-9]/g, '');

    // `deployments.preview_branch_id` is required (by CHECK constraint) whenever
    // is_preview is true, so the preview branch must be provisioned/restored BEFORE the
    // deployment row is created - not inside the executor afterward, which is too late.
    let previewBranchId: number | null = null;
    if (isPreviewBranch) {
      const previewBranch = await ensurePreviewBranch(app, job.branch);
      previewBranchId = previewBranch.id;
    }

    // Created and linked in ONE transaction, before any external work, so a crash mid-job
    // leaves recovery something concrete (a container id, once the pipeline gets that far)
    // to reconcile against instead of an orphaned queue row.
    deploymentId = await withTransaction(async (client) => {
      const id = await createDeploymentRow(client, app.id, job.branch, isPreviewBranch, previewBranchId, version);
      await client.query('UPDATE deploy_queue_jobs SET deployment_id = $1 WHERE id = $2', [id, job.id]);
      return id;
    });

    logger.setDeploymentContext(deploymentId); // safe: this is the only job running

    await executeDeployment({ app, job, deploymentId, isPreviewBranch, version });
  } catch (err) {
    // Only execution failures land here - recording success below is deliberately its
    // own try/catch, NOT part of this one, so a hiccup writing "done" after a genuinely
    // successful deploy can't fall through to this block and get the deployment marked
    // 'failed' out from under it.
    const message = redactLogText(err instanceof Error ? err.message : String(err));

    if (deploymentId !== undefined) {
      // Any error reaching here means the deployment never became active - releasePipeline
      // only returns normally after switchTraffic() succeeds and it has already flipped
      // status to 'active' itself; everything after that point (old-container stop,
      // cache purge) is caught and logged as a warning inside executeDeployment rather
      // than rethrown. So it's always correct to mark 'failed' here, never a risk of
      // overwriting a genuinely successful deploy.
      await updateDeploymentStatus(deploymentId, 'failed').catch((updateErr) => {
        logger.error('Failed to mark deployment failed', updateErr as Error);
      });
    }

    try {
      await pool.query(
        `UPDATE deploy_queue_jobs SET status = 'failed', error = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [message, job.id]
      );
    } catch (updateErr) {
      // The failure-path write itself failed (e.g. DB unreachable). Log and swallow -
      // runJob must never throw: drainQueue's loop, and kick()'s `void drainQueue()`,
      // both depend on that to avoid an unhandled rejection.
      logger.error('Failed to record job failure', updateErr as Error);
    }
    logger.clearDeploymentContext();
    return;
  }

  // executeDeployment succeeded - the deployment is genuinely active at this point.
  // Recording that on the queue row is separate bookkeeping: if it fails, leave the row
  // as 'running' rather than risk marking a live deployment 'failed'. A stuck 'running'
  // row self-heals on the next restart (reconcileInterruptedJobs() resolves it to 'done'
  // by checking the linked deployment's status, same as any other interrupted job) and
  // doesn't block the drain loop from moving on to the next queued job in the meantime.
  try {
    await pool.query(
      `UPDATE deploy_queue_jobs SET status = 'done', finished_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [job.id]
    );
  } catch (updateErr) {
    logger.error('Deployment succeeded but failed to record queue completion', updateErr as Error);
  }
  logger.clearDeploymentContext();
}

async function drainQueue(): Promise<void> {
  const state = getState();
  state.draining = true;
  try {
    while (true) {
      const job = await claimNextJob();
      if (!job) {
        return;
      }
      await runJob(job);
    }
  } finally {
    state.draining = false;
  }
}

/**
 * Startup recovery for deploy_queue_jobs left 'running' by a crash/restart. Must run
 * AFTER recoverContainers()'s deployment-status reconciliation (docker.ts), since it
 * simply mirrors whatever that decided: the deployment ended up 'active' -> job 'done',
 * anything else -> job 'failed'. Never promotes a job on its own authority.
 */
export async function reconcileInterruptedJobs(): Promise<void> {
  const running = await pool.query(
    `SELECT dqj.id, d.status AS deployment_status
     FROM deploy_queue_jobs dqj
     LEFT JOIN deployments d ON d.id = dqj.deployment_id
     WHERE dqj.status = 'running'`
  );

  for (const row of running.rows) {
    const isDone = row.deployment_status === 'active';
    await pool.query(
      `UPDATE deploy_queue_jobs SET status = $1, error = $2, finished_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [isDone ? 'done' : 'failed', isDone ? null : 'Interrupted by a deployment-manager restart', row.id]
    );
  }
}

export async function enqueueManualDeployment(
  appId: number,
  userId: string | undefined,
  branch: string,
  confirmConcurrent: boolean
): Promise<EnqueueManualDeploymentResult> {
  if (!confirmConcurrent) {
    const existing = await pool.query(
      `SELECT id FROM deploy_queue_jobs
       WHERE app_id = $1 AND branch = $2 AND status IN ('queued', 'running')
       LIMIT 1`,
      [appId, branch]
    );
    if (existing.rows.length > 0) {
      return { requiresConfirmation: true };
    }
  }

  const result = await pool.query(
    `INSERT INTO deploy_queue_jobs (app_id, source, branch, requested_sha, requested_by_user_id)
     VALUES ($1, 'manual', $2, NULL, $3)
     RETURNING id`,
    [appId, branch, userId ?? null]
  );

  kick();
  return { queueJobId: result.rows[0].id };
}
