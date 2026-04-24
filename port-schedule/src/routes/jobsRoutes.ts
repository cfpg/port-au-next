import type { FastifyInstance } from 'fastify';
import type { DbPool } from '../db/pool.js';
import type { JobRow } from '../types.js';
import { validateCronExpression } from '../cron/validateAndParse.js';
import { validateWebhookUrl } from '../url/validateWebhookUrl.js';

function parseLimit(raw: string | undefined, def: number, max: number): number {
  const n = parseInt(raw ?? '', 10);
  if (Number.isNaN(n) || n < 1) return def;
  return Math.min(n, max);
}

function parseOffset(raw: string | undefined): number {
  const n = parseInt(raw ?? '', 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function jobToJson(row: JobRow) {
  return {
    id: row.id,
    app_id: row.app_id,
    name: row.name,
    cron_expression: row.cron_expression,
    timezone: row.timezone,
    enabled: row.enabled,
    http_method: row.http_method,
    url: row.url,
    headers_json: row.headers_json,
    body: row.body,
    has_webhook_secret: Boolean(row.webhook_secret),
    deleted_at: row.deleted_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function registerJobsRoutes(app: FastifyInstance, pool: DbPool) {
  app.get('/jobs/deleted', async (request, reply) => {
    const appId = request.tenant!.appId;
    const limit = parseLimit((request.query as { limit?: string }).limit, 50, 200);
    const offset = parseOffset((request.query as { offset?: string }).offset);
    const r = await pool.query<JobRow>(
      `SELECT * FROM port_schedule.jobs
       WHERE app_id = $1 AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [appId, limit, offset]
    );
    const countR = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM port_schedule.jobs WHERE app_id = $1 AND deleted_at IS NOT NULL`,
      [appId]
    );
    return {
      jobs: r.rows.map(jobToJson),
      total: parseInt(countR.rows[0]?.c ?? '0', 10),
      limit,
      offset,
    };
  });

  app.get('/jobs', async (request, reply) => {
    const appId = request.tenant!.appId;
    const limit = parseLimit((request.query as { limit?: string }).limit, 50, 200);
    const offset = parseOffset((request.query as { offset?: string }).offset);
    const r = await pool.query<JobRow>(
      `SELECT * FROM port_schedule.jobs
       WHERE app_id = $1 AND deleted_at IS NULL
       ORDER BY name ASC
       LIMIT $2 OFFSET $3`,
      [appId, limit, offset]
    );
    const countR = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM port_schedule.jobs WHERE app_id = $1 AND deleted_at IS NULL`,
      [appId]
    );
    return {
      jobs: r.rows.map(jobToJson),
      total: parseInt(countR.rows[0]?.c ?? '0', 10),
      limit,
      offset,
    };
  });

  app.post<{ Body: Record<string, unknown> }>('/jobs', async (request, reply) => {
    const appId = request.tenant!.appId;
    const b = request.body ?? {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const cron_expression = typeof b.cron_expression === 'string' ? b.cron_expression.trim() : '';
    const timezone = typeof b.timezone === 'string' ? b.timezone.trim() : '';
    const http_method = typeof b.http_method === 'string' ? b.http_method.trim().toUpperCase() : '';
    const url = typeof b.url === 'string' ? b.url.trim() : '';
    const enabled = typeof b.enabled === 'boolean' ? b.enabled : true;
    const headers_json = b.headers_json ?? null;
    const body = typeof b.body === 'string' ? b.body : null;
    const webhook_secret = typeof b.webhook_secret === 'string' ? b.webhook_secret : null;

    if (!name || !cron_expression || !timezone || !http_method || !url) {
      return reply.code(400).send({ error: 'name, cron_expression, timezone, http_method, url are required' });
    }
    if (!isValidTimezone(timezone)) {
      return reply.code(400).send({ error: 'Invalid IANA timezone' });
    }
    const cronCheck = validateCronExpression(cron_expression, timezone);
    if (!cronCheck.ok) return reply.code(400).send({ error: cronCheck.reason });
    const urlCheck = await validateWebhookUrl(url);
    if (!urlCheck.ok) return reply.code(400).send({ error: urlCheck.reason });

    try {
      const ins = await pool.query<JobRow>(
        `INSERT INTO port_schedule.jobs
         (app_id, name, cron_expression, timezone, enabled, http_method, url, headers_json, body, webhook_secret)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
         RETURNING *`,
        [
          appId,
          name,
          cron_expression,
          timezone,
          enabled,
          http_method,
          url,
          headers_json != null ? JSON.stringify(headers_json) : null,
          body,
          webhook_secret,
        ]
      );
      return reply.code(201).send(jobToJson(ins.rows[0]!));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('jobs_app_id_name_undeleted')) {
        return reply.code(409).send({ error: 'A job with this name already exists' });
      }
      throw e;
    }
  });

  app.patch<{ Params: { jobId: string } }>('/jobs/:jobId/undelete', async (request, reply) => {
    const appId = request.tenant!.appId;
    const jobId = request.params.jobId;
    const r = await pool.query<JobRow>(
      `UPDATE port_schedule.jobs
       SET deleted_at = NULL, updated_at = now()
       WHERE id = $1::uuid AND app_id = $2 AND deleted_at IS NOT NULL
       RETURNING *`,
      [jobId, appId]
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'Job not found or not deleted' });
    return jobToJson(r.rows[0]!);
  });

  app.get<{ Params: { jobId: string } }>('/jobs/:jobId/runs', async (request, reply) => {
    const appId = request.tenant!.appId;
    const jobId = request.params.jobId;
    const limit = parseLimit((request.query as { limit?: string }).limit, 50, 200);
    const offset = parseOffset((request.query as { offset?: string }).offset);

    const jobCheck = await pool.query(`SELECT 1 FROM port_schedule.jobs WHERE id = $1::uuid AND app_id = $2`, [
      jobId,
      appId,
    ]);
    if (jobCheck.rowCount === 0) return reply.code(404).send({ error: 'Job not found' });

    const r = await pool.query(
      `SELECT id, job_id, scheduled_for, started_at, finished_at, status, http_status, error_message,
              response_headers_json, response_body
       FROM port_schedule.job_runs
       WHERE job_id = $1::uuid AND app_id = $2
       ORDER BY scheduled_for DESC
       LIMIT $3 OFFSET $4`,
      [jobId, appId, limit, offset]
    );
    const countR = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM port_schedule.job_runs WHERE job_id = $1::uuid AND app_id = $2`,
      [jobId, appId]
    );
    return {
      runs: r.rows.map((row) => ({
        ...row,
        scheduled_for: (row as { scheduled_for: Date }).scheduled_for.toISOString(),
        started_at: (row as { started_at: Date | null }).started_at?.toISOString() ?? null,
        finished_at: (row as { finished_at: Date | null }).finished_at?.toISOString() ?? null,
      })),
      total: parseInt(countR.rows[0]?.c ?? '0', 10),
      limit,
      offset,
    };
  });

  app.get<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
    const appId = request.tenant!.appId;
    const jobId = request.params.jobId;
    const r = await pool.query<JobRow>(
      `SELECT * FROM port_schedule.jobs WHERE id = $1::uuid AND app_id = $2 AND deleted_at IS NULL`,
      [jobId, appId]
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'Job not found' });
    return jobToJson(r.rows[0]!);
  });

  app.patch<{ Params: { jobId: string }; Body: Record<string, unknown> }>('/jobs/:jobId', async (request, reply) => {
      const appId = request.tenant!.appId;
      const jobId = request.params.jobId;
      const existing = await pool.query<JobRow>(
        `SELECT * FROM port_schedule.jobs WHERE id = $1::uuid AND app_id = $2 AND deleted_at IS NULL`,
        [jobId, appId]
      );
      if (existing.rowCount === 0) return reply.code(404).send({ error: 'Job not found' });
      const cur = existing.rows[0]!;
      const b = request.body ?? {};

      const name = typeof b.name === 'string' ? b.name.trim() : cur.name;
      const cron_expression =
        typeof b.cron_expression === 'string' ? b.cron_expression.trim() : cur.cron_expression;
      const timezone = typeof b.timezone === 'string' ? b.timezone.trim() : cur.timezone;
      const http_method =
        typeof b.http_method === 'string' ? b.http_method.trim().toUpperCase() : cur.http_method;
      const url = typeof b.url === 'string' ? b.url.trim() : cur.url;
      const enabled = typeof b.enabled === 'boolean' ? b.enabled : cur.enabled;
      const headers_json = b.headers_json !== undefined ? b.headers_json : cur.headers_json;
      const body = b.body !== undefined ? (typeof b.body === 'string' ? b.body : null) : cur.body;
      const webhook_secret =
        b.webhook_secret === undefined
          ? cur.webhook_secret
          : b.webhook_secret === null || b.webhook_secret === ''
            ? null
            : typeof b.webhook_secret === 'string'
              ? b.webhook_secret
              : cur.webhook_secret;

      if (!isValidTimezone(timezone)) {
        return reply.code(400).send({ error: 'Invalid IANA timezone' });
      }
      const cronCheck = validateCronExpression(cron_expression, timezone);
      if (!cronCheck.ok) return reply.code(400).send({ error: cronCheck.reason });
      const urlCheck = await validateWebhookUrl(url);
      if (!urlCheck.ok) return reply.code(400).send({ error: urlCheck.reason });

      try {
        const upd = await pool.query<JobRow>(
          `UPDATE port_schedule.jobs SET
             name = $3,
             cron_expression = $4,
             timezone = $5,
             enabled = $6,
             http_method = $7,
             url = $8,
             headers_json = $9::jsonb,
             body = $10,
             webhook_secret = $11,
             updated_at = now()
           WHERE id = $1::uuid AND app_id = $2 AND deleted_at IS NULL
           RETURNING *`,
          [
            jobId,
            appId,
            name,
            cron_expression,
            timezone,
            enabled,
            http_method,
            url,
            headers_json != null ? JSON.stringify(headers_json) : null,
            body,
            webhook_secret,
          ]
        );
        return jobToJson(upd.rows[0]!);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('jobs_app_id_name_undeleted')) {
          return reply.code(409).send({ error: 'A job with this name already exists' });
        }
        throw e;
      }
  });

  app.delete<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
    const appId = request.tenant!.appId;
    const jobId = request.params.jobId;
    const r = await pool.query(
      `UPDATE port_schedule.jobs SET deleted_at = now(), updated_at = now()
       WHERE id = $1::uuid AND app_id = $2 AND deleted_at IS NULL`,
      [jobId, appId]
    );
    if (r.rowCount === 0) return reply.code(404).send({ error: 'Job not found' });
    return reply.code(204).send();
  });

  app.get('/runs', async (request, reply) => {
    const appId = request.tenant!.appId;
    const limit = parseLimit((request.query as { limit?: string }).limit, 50, 200);
    const offset = parseOffset((request.query as { offset?: string }).offset);
    const r = await pool.query(
      `SELECT id, job_id, scheduled_for, started_at, finished_at, status, http_status, error_message,
              response_headers_json, response_body
       FROM port_schedule.job_runs
       WHERE app_id = $1
       ORDER BY scheduled_for DESC
       LIMIT $2 OFFSET $3`,
      [appId, limit, offset]
    );
    const countR = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM port_schedule.job_runs WHERE app_id = $1`,
      [appId]
    );
    return {
      runs: r.rows.map((row) => ({
        ...row,
        scheduled_for: (row as { scheduled_for: Date }).scheduled_for.toISOString(),
        started_at: (row as { started_at: Date | null }).started_at?.toISOString() ?? null,
        finished_at: (row as { finished_at: Date | null }).finished_at?.toISOString() ?? null,
      })),
      total: parseInt(countR.rows[0]?.c ?? '0', 10),
      limit,
      offset,
    };
  });
}
