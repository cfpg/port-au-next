import type { PoolClient } from 'pg';
import pool, { withTransaction } from '~/services/database';
import logger from '~/services/logger';
import { executeDeployment } from '~/services/deploymentExecutor';
import { updateDeploymentStatus } from '~/services/deploymentStatus';
import { deletePreviewBranch, ensurePreviewBranch, getPreviewBranch } from '~/services/previewBranches';
import { listOpenPullsByHead } from '~/services/githubApp';
import { redactLogText } from '~/lib/redactLogs';
import { normalizeGithubRepoFullName } from '~/utils/githubRepoMatch';
import { AppFeature } from '~/types/appFeatures';
import { assertWebhookConnectionUnchanged } from '~/services/resolveGitAuth';

export type DeployQueueJobKind = 'deploy' | 'teardown';

interface DeployQueueJob {
  id: number;
  app_id: number;
  source: 'manual' | 'webhook';
  branch: string;
  requested_sha: string | null;
  requested_by_user_id: string | null;
  installation_id: string | null;
  repo_id: string | null;
  github_delivery_id: string | null;
  job_kind: DeployQueueJobKind;
  github_pr_number: number | null;
}

export interface EnqueueManualDeploymentResult {
  queueJobId?: number;
  requiresConfirmation?: true;
}

// Every deployment - manual or webhook-triggered - and every preview teardown runs through
// this single queue and worker. See docs/SOW-github-autodeploy.md: this is what makes
// "only one deployment runs at a time" true by construction instead of by convention, and
// is why the old fire-and-forget dashboard action and its logger/redaction singleton
// mutation are safe now - there is exactly one place that ever calls executeDeployment().
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
      `SELECT id, app_id, source, branch, requested_sha, requested_by_user_id, installation_id, repo_id,
              github_delivery_id, job_kind, github_pr_number
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

async function markJobFailed(jobId: number, message: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE deploy_queue_jobs SET status = 'failed', error = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [message, jobId]
    );
  } catch (updateErr) {
    // The failure-path write itself failed (e.g. DB unreachable). Log and swallow -
    // runJob must never throw: drainQueue's loop, and kick()'s `void drainQueue()`,
    // both depend on that to avoid an unhandled rejection.
    logger.error('Failed to record job failure', updateErr as Error);
  }
}

async function markJobDone(jobId: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE deploy_queue_jobs SET status = 'done', finished_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [jobId]
    );
  } catch (updateErr) {
    logger.error('Job succeeded but failed to record queue completion', updateErr as Error);
  }
}

async function runTeardownJob(job: DeployQueueJob): Promise<void> {
  try {
    const app = await fetchApp(job.app_id);

    if (job.branch === app.branch) {
      await logger.warning('Refusing to tear down the production branch from a webhook job', {
        appId: app.id,
        branch: job.branch,
      });
      await markJobDone(job.id);
      return;
    }

    const installation = await assertWebhookConnectionUnchanged(app, {
      installationId: job.installation_id ?? '',
      repoId: job.repo_id ?? '',
    });

    const previewBranch = await getPreviewBranch(app.id, job.branch);
    if (!previewBranch || previewBranch.deleted_at) {
      await markJobDone(job.id);
      return;
    }

    const openPulls = await listOpenPullsByHead(
      Number(installation.installation_id),
      Number(installation.repo_id),
      installation.repo_full_name,
      job.branch
    );
    const otherOpenPulls = openPulls.filter((pull) => pull.number !== job.github_pr_number);
    if (otherOpenPulls.length > 0) {
      await logger.info('Skipping preview teardown; other open PRs share this head branch', {
        appId: app.id,
        branch: job.branch,
        closedPr: job.github_pr_number,
        remainingPrs: otherOpenPulls.map((pull) => pull.number),
      });
      await markJobDone(job.id);
      return;
    }

    await deletePreviewBranch(app.id, job.branch, { skipActiveJobCheck: true });
    await markJobDone(job.id);
  } catch (err) {
    const message = redactLogText(err instanceof Error ? err.message : String(err));
    await markJobFailed(job.id, message);
  }
}

// Exported (only drainQueue calls it in production) so it's directly unit-testable without
// having to drive it through kick()'s fire-and-forget async drain loop, which has no
// promise a test can await.
export async function runJob(job: DeployQueueJob): Promise<void> {
  if ((job.job_kind ?? 'deploy') === 'teardown') {
    await runTeardownJob(job);
    return;
  }

  // Tracked outside the try so the catch block can mark the deployment itself failed, not
  // just the queue row - without this, a build/git/readiness failure left the deployment
  // stuck at 'building'/'preflight' forever (only a restart's recovery pass would touch it).
  let deploymentId: number | undefined;

  try {
    const app = await fetchApp(job.app_id);
    const isPreviewBranch = job.branch !== app.branch;
    const version = new Date().toISOString().replace(/[^0-9]/g, '');

    // For a webhook job, reject a since-changed GitHub connection (installation, repo id,
    // OR the app's repo_url) BEFORE provisioning anything - ensurePreviewBranch() below
    // creates a real database/subdomain, and resolveGitAuth() (called later, inside
    // executeDeployment) checking this same thing is too late to prevent that: it would
    // only stop the git/deploy step, after a stale job already left behind preview
    // infrastructure for a connection that no longer applies. This is its own read,
    // separate from the one resolveGitAuth() does later - not reused across that gap in
    // time, but each individual check reads its own consistent snapshot rather than
    // splitting "validate" and "use" across two reads (see resolveGitAuth.ts's own
    // comment on why that specific split was the actual bug). installation_id/repo_id are
    // only ever missing here if the row was somehow inserted without them, which
    // enqueueGithubPushEvent never does - treated as a mismatch (fail closed) rather than
    // skipping the check.
    if (job.source === 'webhook') {
      await assertWebhookConnectionUnchanged(app, {
        installationId: job.installation_id ?? '',
        repoId: job.repo_id ?? '',
      });
    }

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

    await markJobFailed(job.id, message);
    logger.clearDeploymentContext();
    return;
  }

  // executeDeployment succeeded - the deployment is genuinely active at this point.
  // Recording that on the queue row is separate bookkeeping: if it fails, leave the row
  // as 'running' rather than risk marking a live deployment 'failed'. A stuck 'running'
  // row self-heals on the next restart (reconcileInterruptedJobs() resolves it to 'done'
  // by checking the linked deployment's status, same as any other interrupted job) and
  // doesn't block the drain loop from moving on to the next queued job in the meantime.
  await markJobDone(job.id);
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

export interface GithubPushEventInput {
  installationId: number;
  repoId: number;
  branch: string;
  sha: string;
  deliveryId: string;
}

export interface EnqueueGithubWebhookEventResult {
  /** Apps eligible for this installation/repo/branch, regardless of whether their job was a fresh insert or a dedup no-op. */
  eligibleAppIds: number[];
  /** Apps for which a NEW queue row was actually inserted by this call. */
  insertedJobIds: number[];
  /** Set when connected Auto-deploy apps exist but this push was a non-production branch. */
  ignoredReason?: 'preview_requires_pull_request';
}

/** @deprecated Use EnqueueGithubWebhookEventResult - kept as an alias so existing imports compile. */
export type EnqueueGithubPushEventResult = EnqueueGithubWebhookEventResult;

export interface GithubPullRequestEventInput {
  installationId: number;
  repoId: number;
  branch: string;
  sha: string;
  deliveryId: string;
  prNumber: number;
  kind: DeployQueueJobKind;
}

interface WebhookAppCandidateRow {
  id: number;
  branch: string;
  repo_url: string;
  preview_domain: string | null;
  repo_full_name: string;
  auto_deploy_enabled: boolean;
  previews_enabled: boolean;
  has_live_preview: boolean;
}

function repoMatchesInstallation(candidate: WebhookAppCandidateRow): boolean {
  const normalizedRepoUrl = normalizeGithubRepoFullName(candidate.repo_url);
  return Boolean(normalizedRepoUrl && normalizedRepoUrl === candidate.repo_full_name.toLowerCase());
}

async function fetchWebhookAppCandidates(
  client: PoolClient,
  installationId: number,
  repoId: number,
  branch: string
) {
  return client.query<WebhookAppCandidateRow>(
    `SELECT
       a.id,
       a.branch,
       a.repo_url,
       a.preview_domain,
       gi.repo_full_name,
       COALESCE(adf.enabled, FALSE) AS auto_deploy_enabled,
       COALESCE(pf.enabled, FALSE) AS previews_enabled,
       (pb.id IS NOT NULL) AS has_live_preview
     FROM apps a
     JOIN github_installations gi ON gi.app_id = a.id
     LEFT JOIN app_features adf ON adf.app_id = a.id AND adf.feature = $1
     LEFT JOIN app_features pf ON pf.app_id = a.id AND pf.feature = $2
     LEFT JOIN preview_branches pb ON pb.app_id = a.id AND pb.branch = $5 AND pb.deleted_at IS NULL
     WHERE gi.installation_id = $3 AND gi.repo_id = $4`,
    [AppFeature.AUTO_DEPLOY, AppFeature.PREVIEW_BRANCHES, installationId, repoId, branch]
  );
}

async function insertWebhookJob(
  client: PoolClient,
  input: {
    appId: number;
    branch: string;
    sha: string | null;
    installationId: number;
    repoId: number;
    deliveryId: string;
    jobKind: DeployQueueJobKind;
    prNumber: number | null;
  }
): Promise<number | null> {
  const insertResult = await client.query<{ id: number }>(
    `INSERT INTO deploy_queue_jobs
       (app_id, source, branch, requested_sha, installation_id, repo_id, github_delivery_id, job_kind, github_pr_number)
     VALUES ($1, 'webhook', $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (app_id, github_delivery_id) WHERE github_delivery_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.appId,
      input.branch,
      input.sha,
      input.installationId,
      input.repoId,
      input.deliveryId,
      input.jobKind,
      input.prNumber,
    ]
  );
  return insertResult.rows[0]?.id ?? null;
}

/**
 * Durably enqueues a webhook-triggered production deployment for every app eligible for
 * this exact push - never just the first match, since the schema allows more than one
 * platform app to connect to the same repository (see githubInstallationsQuery.ts:
 * `github_installations` is only unique per app_id, not per installation/repo). All
 * eligibility checks and all inserts for this one delivery happen inside a SINGLE
 * transaction, so a delivery that matches several apps is accepted for all of them or
 * none - never a partial subset if something fails partway through.
 *
 * Eligibility, per candidate app connected to this installation_id+repo_id:
 *   - Auto-deploy must be explicitly enabled (app_features) - connecting GitHub alone
 *     never triggers this.
 *   - The app's CURRENT repo_url must still normalize to the connected installation's
 *     repo_full_name - an app whose repo_url has since diverged from its connection is
 *     skipped here for the same reason resolveGitAuth() refuses it at execution time
 *     (GithubRepoMismatchError): never deploy through a connection that no longer matches
 *     what the app is configured for.
 *   - The pushed branch must be the app's configured production branch. Non-production
 *     pushes no longer queue a preview - that is gated on pull_request events instead
 *     (see enqueueGithubPullRequestEvent).
 *
 * Deduplication is the existing partial unique index on (app_id, github_delivery_id) -
 * `ON CONFLICT ... DO NOTHING` here repeats its exact predicate (Postgres requires that to
 * match), and rows are never deleted, so a delivery redelivered after its job already
 * finished (done or failed) still conflicts and is not re-queued. This is a first-writer-
 * wins conflict Postgres itself resolves atomically, so concurrent deliveries of the same
 * event race safely with no extra locking needed here.
 *
 * FIFO order is queue ACCEPTANCE order (ascending id, per drainQueue's claimNextJob) - this
 * function does no reordering or coalescing, and does not assume GitHub delivers push
 * events in the order they occurred.
 */
export async function enqueueGithubPushEvent(input: GithubPushEventInput): Promise<EnqueueGithubWebhookEventResult> {
  const result = await withTransaction(async (client: PoolClient) => {
    const candidates = await fetchWebhookAppCandidates(client, input.installationId, input.repoId, input.branch);

    const eligibleAppIds: number[] = [];
    const insertedJobIds: number[] = [];
    let skippedNonProd = false;

    for (const candidate of candidates.rows) {
      if (!repoMatchesInstallation(candidate)) {
        continue;
      }

      if (input.branch !== candidate.branch) {
        if (candidate.auto_deploy_enabled) {
          skippedNonProd = true;
        }
        continue;
      }

      if (!candidate.auto_deploy_enabled) {
        continue;
      }

      eligibleAppIds.push(candidate.id);

      const insertedId = await insertWebhookJob(client, {
        appId: candidate.id,
        branch: input.branch,
        sha: input.sha,
        installationId: input.installationId,
        repoId: input.repoId,
        deliveryId: input.deliveryId,
        jobKind: 'deploy',
        prNumber: null,
      });
      if (insertedId !== null) {
        insertedJobIds.push(insertedId);
      }
    }

    return {
      eligibleAppIds,
      insertedJobIds,
      ...(eligibleAppIds.length === 0 && skippedNonProd
        ? { ignoredReason: 'preview_requires_pull_request' as const }
        : {}),
    };
  });

  if (result.insertedJobIds.length > 0) {
    kick();
  }
  return result;
}

/**
 * Enqueues a preview deploy (`opened`/`synchronize`/`reopened`) or teardown (`closed`) for
 * every eligible app connected to this installation+repository. Same transaction / dedup
 * / kick contract as enqueueGithubPushEvent. The webhook route never calls the GitHub API;
 * the "other open PRs on this head?" check runs in the worker.
 *
 * Preview deploy eligibility: Auto-deploy on, Preview Branches on, preview domain set,
 * repo_url still matches, head branch is not the app's production branch.
 *
 * Teardown eligibility: a live preview_branches row for the head branch, repo_url still
 * matches, head is not production. Auto-deploy does NOT need to still be on - otherwise
 * flipping that toggle would leak containers.
 */
export async function enqueueGithubPullRequestEvent(
  input: GithubPullRequestEventInput
): Promise<EnqueueGithubWebhookEventResult> {
  const result = await withTransaction(async (client: PoolClient) => {
    const candidates = await fetchWebhookAppCandidates(client, input.installationId, input.repoId, input.branch);

    const eligibleAppIds: number[] = [];
    const insertedJobIds: number[] = [];

    for (const candidate of candidates.rows) {
      if (!repoMatchesInstallation(candidate)) {
        continue;
      }

      if (input.branch === candidate.branch) {
        continue; // never preview-deploy or tear down the production branch
      }

      if (input.kind === 'deploy') {
        if (!candidate.auto_deploy_enabled || !candidate.previews_enabled || !candidate.preview_domain) {
          continue;
        }
      } else if (!candidate.has_live_preview) {
        continue;
      }

      eligibleAppIds.push(candidate.id);

      const insertedId = await insertWebhookJob(client, {
        appId: candidate.id,
        branch: input.branch,
        sha: input.kind === 'deploy' ? input.sha : null,
        installationId: input.installationId,
        repoId: input.repoId,
        deliveryId: input.deliveryId,
        jobKind: input.kind,
        prNumber: input.prNumber,
      });
      if (insertedId !== null) {
        insertedJobIds.push(insertedId);
        if (input.kind === 'teardown') {
          // Only cancel when this delivery actually inserted a teardown - a redelivery
          // after a later reopen must not cancel the reopen's deploy.
          await client.query(
            `UPDATE deploy_queue_jobs
             SET status = 'failed', error = 'Cancelled: pull request closed', finished_at = CURRENT_TIMESTAMP
             WHERE app_id = $1 AND branch = $2 AND job_kind = 'deploy' AND status = 'queued'`,
            [candidate.id, input.branch]
          );
        }
      }
    }

    return { eligibleAppIds, insertedJobIds };
  });

  if (result.insertedJobIds.length > 0) {
    kick();
  }
  return result;
}
