import fs from 'fs';
import path from 'path';

import logger from '~/services/logger';
import type { App } from '~/types';

export interface VercelCronEntry {
  path: string;
  schedule: string;
}

interface PortScheduleJob {
  id: string;
  name: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  http_method: string;
  url: string;
  auth_scheme: 'x-portaunext-schedule' | 'bearer';
  source: 'api' | 'vercel';
  has_webhook_secret: boolean;
}

interface DesiredJob {
  name: string;
  cron_expression: string;
  timezone: 'UTC';
  http_method: 'GET';
  url: string;
  enabled: true;
  source: 'vercel';
  auth_scheme: 'bearer' | 'x-portaunext-schedule';
  webhook_secret: string | null;
}

const JOBS_LIST_LIMIT = 200;

function isValidCronEntry(raw: unknown): raw is VercelCronEntry {
  if (!raw || typeof raw !== 'object') return false;
  const { path: p, schedule } = raw as Record<string, unknown>;
  if (typeof p !== 'string' || !p.startsWith('/')) return false;
  if (typeof schedule !== 'string' || schedule.trim().split(/\s+/).length !== 5) return false;
  return true;
}

/**
 * Reads `vercel.json` from the app's project root and returns its `crons` entries.
 * Never throws: a missing file, invalid JSON, missing/malformed `crons`, or an invalid
 * entry is logged as a warning and skipped so a deploy is never blocked by this file.
 */
export async function readVercelCrons(projectDir: string, appName: string): Promise<VercelCronEntry[]> {
  const filePath = path.join(projectDir, 'vercel.json');
  if (!fs.existsSync(filePath)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    await logger.warning('vercel.json: failed to parse; skipping cron sync', {
      app: appName,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }

  const crons = (parsed as { crons?: unknown } | null)?.crons;
  if (crons === undefined) return [];
  if (!Array.isArray(crons)) {
    await logger.warning('vercel.json: "crons" is not an array; skipping cron sync', { app: appName });
    return [];
  }

  const entries: VercelCronEntry[] = [];
  for (const raw of crons) {
    if (isValidCronEntry(raw)) {
      entries.push({ path: raw.path, schedule: raw.schedule });
    } else {
      await logger.warning('vercel.json: invalid cron entry skipped', { app: appName, entry: raw });
    }
  }
  return entries;
}

function toDesiredJob(entry: VercelCronEntry, app: App, cronSecret: string | null): DesiredJob {
  return {
    name: entry.path,
    cron_expression: `0 ${entry.schedule}`,
    timezone: 'UTC',
    http_method: 'GET',
    url: `https://${app.domain}${entry.path}`,
    enabled: true,
    source: 'vercel',
    auth_scheme: cronSecret ? 'bearer' : 'x-portaunext-schedule',
    webhook_secret: cronSecret,
  };
}

async function fetchAllVercelJobs(baseUrl: string, apiKey: string): Promise<PortScheduleJob[]> {
  const all: PortScheduleJob[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${baseUrl}/v1/jobs?limit=${JOBS_LIST_LIMIT}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`list jobs failed: ${res.status} ${await res.text().catch(() => '')}`);
    }
    const body = (await res.json()) as { jobs: PortScheduleJob[]; total: number };
    all.push(...body.jobs);
    offset += body.jobs.length;
    if (body.jobs.length === 0 || offset >= body.total) break;
  }
  return all.filter((j) => j.source === 'vercel');
}

function jobNeedsUpdate(existing: PortScheduleJob, desired: DesiredJob): boolean {
  return (
    existing.cron_expression !== desired.cron_expression ||
    existing.timezone !== desired.timezone ||
    existing.http_method !== desired.http_method ||
    existing.url !== desired.url ||
    existing.enabled !== desired.enabled ||
    existing.auth_scheme !== desired.auth_scheme ||
    existing.has_webhook_secret !== Boolean(desired.webhook_secret)
  );
}

/**
 * Reconciles `port-schedule` jobs tagged `source: 'vercel'` for this app against the
 * desired set parsed from `vercel.json`: creates missing jobs, updates changed ones,
 * and soft-deletes ones no longer declared. Jobs with any other `source` (created
 * manually through the API) are never read or touched. Best-effort: every failure is
 * logged and the affected entry is skipped rather than throwing out of the pipeline.
 */
export async function reconcileVercelCrons(
  app: App,
  appEnv: Record<string, string>,
  crons: VercelCronEntry[]
): Promise<void> {
  const baseUrl = appEnv.PORT_SCHEDULE_URL?.trim();
  const apiKey = appEnv.PORT_SCHEDULE_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    if (crons.length > 0) {
      await logger.warning('vercel.json: crons declared but port-schedule is not configured; skipping', {
        app: app.name,
      });
    }
    return;
  }
  if (!app.domain) {
    if (crons.length > 0) {
      await logger.warning('vercel.json: crons declared but app has no domain configured; skipping', {
        app: app.name,
      });
    }
    return;
  }

  const cronSecret = appEnv.CRON_SECRET?.trim() || null;
  const desiredJobs = crons.map((entry) => toDesiredJob(entry, app, cronSecret));
  const desiredByName = new Map(desiredJobs.map((j) => [j.name, j]));

  let existingVercelJobs: PortScheduleJob[];
  try {
    existingVercelJobs = await fetchAllVercelJobs(baseUrl, apiKey);
  } catch (e) {
    await logger.warning('vercel.json: failed to list existing port-schedule jobs; skipping cron sync', {
      app: app.name,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }
  const existingByName = new Map(existingVercelJobs.map((j) => [j.name, j]));

  for (const desired of desiredJobs) {
    const existing = existingByName.get(desired.name);
    try {
      if (!existing) {
        const res = await fetch(`${baseUrl}/v1/jobs`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(desired),
        });
        if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text().catch(() => '')}`);
      } else if (jobNeedsUpdate(existing, desired)) {
        const res = await fetch(`${baseUrl}/v1/jobs/${existing.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(desired),
        });
        if (!res.ok) throw new Error(`update failed: ${res.status} ${await res.text().catch(() => '')}`);
      }
    } catch (e) {
      await logger.warning('vercel.json: failed to sync cron job; skipping entry', {
        app: app.name,
        path: desired.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const staleJobs = existingVercelJobs.filter((j) => !desiredByName.has(j.name));
  for (const stale of staleJobs) {
    try {
      const res = await fetch(`${baseUrl}/v1/jobs/${stale.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`delete failed: ${res.status} ${await res.text().catch(() => '')}`);
      }
    } catch (e) {
      await logger.warning('vercel.json: failed to remove stale cron job', {
        app: app.name,
        path: stale.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (desiredJobs.length > 0 || staleJobs.length > 0) {
    await logger.info('vercel.json: cron sync complete', {
      app: app.name,
      synced: desiredJobs.length,
      removed: staleJobs.length,
    });
  }
}

/**
 * Reads `vercel.json` from `projectDir` and reconciles `port-schedule` jobs to match.
 * Production deploys only (callers gate on `!isPreview`). Never throws — a failure
 * here must never fail a deploy.
 */
export async function syncVercelCronsForApp(
  app: App,
  appEnv: Record<string, string>,
  projectDir: string
): Promise<void> {
  try {
    const crons = await readVercelCrons(projectDir, app.name);
    await reconcileVercelCrons(app, appEnv, crons);
  } catch (e) {
    await logger.warning('vercel.json: cron sync failed unexpectedly; continuing deploy', {
      app: app.name,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
