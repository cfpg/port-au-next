import pLimit from 'p-limit';
import type { DbPool } from '../db/pool.js';
import type { JobRow } from '../types.js';
import { fireTimesBetween } from '../cron/validateAndParse.js';
import { MAX_OUTBOUND_CONCURRENCY, SCHEDULER_TICK_MS } from '../constants.js';
import { executeOutboundWebhook } from '../http/outbound.js';
import { validateWebhookUrl } from '../url/validateWebhookUrl.js';

async function tryClaimRun(pool: DbPool, job: JobRow, scheduledFor: Date): Promise<string | null> {
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO port_schedule.job_runs (job_id, app_id, scheduled_for, status, started_at)
     VALUES ($1::uuid, $2, $3, 'running', now())
     ON CONFLICT (job_id, scheduled_for) DO NOTHING
     RETURNING id`,
    [job.id, job.app_id, scheduledFor]
  );
  return ins.rows[0]?.id ?? null;
}

async function finalizeRun(
  pool: DbPool,
  runId: string,
  patch: {
    status: string;
    http_status: number | null;
    error_message: string | null;
    response_headers_json: unknown | null;
    response_body: string | null;
  }
) {
  await pool.query(
    `UPDATE port_schedule.job_runs SET
       finished_at = now(),
       status = $2,
       http_status = $3,
       error_message = $4,
       response_headers_json = $5::jsonb,
       response_body = $6
     WHERE id = $1::uuid`,
    [
      runId,
      patch.status,
      patch.http_status,
      patch.error_message,
      patch.response_headers_json ? JSON.stringify(patch.response_headers_json) : null,
      patch.response_body,
    ]
  );
}

async function runOutboundJob(pool: DbPool, job: JobRow, runId: string) {
  const urlCheck = await validateWebhookUrl(job.url);
  if (!urlCheck.ok) {
    await finalizeRun(pool, runId, {
      status: 'failure',
      http_status: null,
      error_message: urlCheck.reason,
      response_headers_json: null,
      response_body: null,
    });
    return;
  }

  const result = await executeOutboundWebhook(
    {
      method: job.http_method,
      url: job.url,
      headersJson: job.headers_json,
      body: job.body,
      webhookSecret: job.webhook_secret,
    },
    validateWebhookUrl
  );

  if (!result.ok) {
    await finalizeRun(pool, runId, {
      status: 'failure',
      http_status: result.httpStatus ?? null,
      error_message: result.error,
      response_headers_json: null,
      response_body: null,
    });
    return;
  }

  await finalizeRun(pool, runId, {
    status: result.httpStatus >= 200 && result.httpStatus < 400 ? 'success' : 'failure',
    http_status: result.httpStatus,
    error_message: result.httpStatus >= 200 && result.httpStatus < 400 ? null : `HTTP ${result.httpStatus}`,
    response_headers_json: result.responseHeaders,
    response_body: result.responseBodyStored,
  });
}

export function startScheduler(pool: DbPool, log: { info: (m: string, o?: object) => void; error: (m: string, e?: unknown) => void }) {
  const limit = pLimit(MAX_OUTBOUND_CONCURRENCY);

  const tick = async () => {
    const now = new Date();
    let jobs: JobRow[] = [];
    try {
      const r = await pool.query<JobRow>(
        `SELECT * FROM port_schedule.jobs WHERE deleted_at IS NULL AND enabled = true`
      );
      jobs = r.rows;
    } catch (e) {
      log.error('scheduler: failed to load jobs', e);
      return;
    }

    for (const job of jobs) {
      try {
        const lower = job.last_fired_scheduled_for ?? job.created_at;
        const fires = fireTimesBetween(job.cron_expression, job.timezone, new Date(lower), now);
        if (fires.length === 0) continue;

        const maxFire = fires.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));

        for (const t of fires) {
          const runId = await tryClaimRun(pool, job, t);
          if (runId) {
            void limit(() => runOutboundJob(pool, job, runId)).catch(async (e) => {
              log.error('scheduler: run failed', e);
              await finalizeRun(pool, runId, {
                status: 'failure',
                http_status: null,
                error_message: e instanceof Error ? e.message : String(e),
                response_headers_json: null,
                response_body: null,
              });
            });
          }
        }

        await pool.query(
          `UPDATE port_schedule.jobs SET last_fired_scheduled_for = $2, updated_at = now() WHERE id = $1::uuid`,
          [job.id, maxFire]
        );
      } catch (e) {
        log.error(`scheduler: job ${job.id}`, e);
      }
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, SCHEDULER_TICK_MS);

  void tick();

  return () => clearInterval(handle);
}
