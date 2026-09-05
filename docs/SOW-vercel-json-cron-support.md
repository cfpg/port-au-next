# Statement of Work: `vercel.json` Cron Job Support

**Project:** Port-Au-Next — app-portable cron declarations via `vercel.json`
**Date:** 2026-09-04
**Status:** Implemented (Phases 1–3); no automated test suite added — see §6 Phase 1
**Depends on:** `port-schedule` (implemented), `deployment-manager` release pipeline (implemented)

---

## 1. Executive Summary

`port-schedule` already runs scheduled HTTP jobs for deployed apps, but jobs only exist as rows created imperatively through its REST API — there is no way for an app to *declare* its own cron jobs in its repo and have them "just work" on deploy. The one precedent (`apps/deportimetromx/src/instrumentation.ts`) hardcodes a job array and self-registers at boot, which is Next.js-specific, requires app code changes, and has no cleanup path when a job is removed.

This SOW adds support for Vercel's [`vercel.json` `crons` array](https://vercel.com/docs/cron-jobs) as an app-portable, framework-agnostic cron manifest. `deployment-manager` reads `vercel.json` from the app's source tree during the release pipeline, translates each cron entry into a `port-schedule` job, and reconciles (create/update/delete) so the job set always matches what's declared in the repo — no app code required, and an app moving from Vercel to Port-Au-Next (or back) keeps working unmodified.

---

## 2. Background

### 2.1 Current state

| Layer | Behavior |
|-------|----------|
| `port-schedule` | Fastify + Postgres service; jobs are DB rows created via `POST /v1/jobs` (per-app API key auth); fires jobs as outbound HTTP calls on a 10s poll (`src/scheduler/tick.ts`) |
| Job auth today | Outbound calls send a custom `X-PortAuNext-Schedule: <webhook_secret>` header (`src/http/outbound.ts`), checked by the receiving app route |
| Deploy pipeline | `deployment-manager/src/services/releasePipeline.ts` merges env (`mergeAppEnv`), which — for production, non-preview deploys only — calls `ensurePortScheduleForProductionApp(app)` to provision/rotate the app's `port-schedule` tenant API key and inject `PORT_SCHEDULE_URL` / `PORT_SCHEDULE_API_KEY` into the app's env |
| App-declared crons | No platform support. Only precedent is `deportimetromx`'s `instrumentation.ts`, which self-registers a hardcoded job list at server boot — Next.js-only, requires editing app source, no reconciliation (jobs removed from the array are never deleted) |

### 2.2 Gap

Vercel projects declare crons declaratively in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/reprocess", "schedule": "0 3 * * *" }
  ]
}
```

Vercel invokes `path` as a `GET` request against the project's own deployment URL, sending `Authorization: Bearer $CRON_SECRET` when the project defines a `CRON_SECRET` env var. For an app to be portable between Vercel and Port-Au-Next with **zero code changes**, Port-Au-Next needs to recognize the same file and reproduce the same invocation contract.

---

## 3. Goals

1. **Zero-touch portability** — an app with a `vercel.json` `crons` array gets matching `port-schedule` jobs on production deploy, with no app code changes.
2. **Vercel-compatible dispatch** — jobs sourced from `vercel.json` are invoked the same way Vercel invokes them (`GET`, `Authorization: Bearer $CRON_SECRET` when the app defines one), so an existing Vercel cron route handler works unmodified.
3. **Reconciliation, not just creation** — removing or editing a cron in `vercel.json` removes or updates the corresponding job on the next deploy; jobs created manually via the API are never touched.
4. **Non-blocking** — a missing, empty, or malformed `vercel.json` never fails a deploy.

---

## 4. Scope

### 4.1 In scope

| Item | Detail |
|------|--------|
| `vercel.json` `crons[]` parsing | `path` + `schedule` fields only |
| Cron translation | 5-field → 6-field cron, UTC timezone, `GET`, full URL from `app.domain` + `path` |
| `port-schedule` bearer-auth mode | New `auth_scheme` option so outbound calls can send `Authorization: Bearer` instead of the custom header |
| Reconciliation | Create / update / soft-delete `port-schedule` jobs to match the current `vercel.json` on every production deploy |
| Pipeline wiring | Read `vercel.json` and reconcile as a step in `runReleasePipeline` |
| Docs | README section describing the convention and `CRON_SECRET` behavior |

### 4.2 Out of scope

| Item | Reason |
|------|--------|
| Other `vercel.json` fields (`redirects`, `headers`, `rewrites`, `functions`, `regions`, `builds`, etc.) | Only `crons` is relevant to this feature; everything else in the file is ignored and left untouched |
| Preview branch cron sync | Confirmed production-only, matching existing `ensurePortScheduleForProductionApp` gating |
| Auto-generating `CRON_SECRET` when the app doesn't define one | Confirmed: only use it if the app already set it; jobs without one run unauthenticated (as they would on Vercel too if `CRON_SECRET` is unset) |
| A dashboard UI for viewing/editing jobs | No such UI exists today for `port-schedule` jobs generally; out of scope here. Jobs remain manageable via the existing `port-schedule` REST API |
| Vercel cron concurrency limits / plan-based schedule restrictions | Port-Au-Next has no equivalent plan tiers; not modeled |

---

## 5. Technical design

### 5.1 Translation

| `vercel.json` `crons[]` entry | `port-schedule` job field |
|---|---|
| `schedule` (5-field cron) | `cron_expression`: prepend `"0 "` → 6-field (seconds always `0`) |
| — | `timezone`: `"UTC"` (Vercel crons always run in UTC) |
| — | `http_method`: `"GET"` |
| `path` | `url`: `` `https://${app.domain}${path}` `` |
| `path` | `name`: the `path` value itself (unique per app since paths are unique in `vercel.json`) |
| — | `source`: `"vercel"` — identifies the job's origin for reconciliation (see §5.2, §5.5) |
| App's `CRON_SECRET` env var, if set | `webhook_secret`: the value; `auth_scheme`: `"bearer"` |
| App's `CRON_SECRET` unset | `webhook_secret`: `null`; `auth_scheme`: default (no auth header sent) |

Validation before submitting to `port-schedule` (which re-validates anyway): `path` must start with `/`; `schedule` must parse as a valid 5-field cron. `port-schedule`'s existing `validateCronExpression` (10s minimum interval) and `validateWebhookUrl` (SSRF checks) apply unchanged since jobs are created through the normal `POST /v1/jobs` / `PATCH /v1/jobs/:id` API.

### 5.2 `port-schedule`: bearer auth mode + job source

Add two columns to `port_schedule.jobs`:

```sql
ALTER TABLE port_schedule.jobs
  ADD COLUMN auth_scheme TEXT NOT NULL DEFAULT 'x-portaunext-schedule'
  CHECK (auth_scheme IN ('x-portaunext-schedule', 'bearer'));

ALTER TABLE port_schedule.jobs
  ADD COLUMN source TEXT NOT NULL DEFAULT 'api'
  CHECK (source IN ('api', 'vercel'));
```

- `source` replaces name-prefix conventions as the origin marker: `'api'` for anything created the way jobs are created today (including manually, through the dashboard-less REST API), `'vercel'` for jobs synced from a `vercel.json`. Every existing row backfills to `'api'` by the column default, so nothing already created changes classification.
- `jobsRoutes.ts` create/update accept optional `auth_scheme` and `source` fields (both default to the existing/legacy value, so current callers are unaffected). `jobToJson` includes `source` in responses.
- `src/http/outbound.ts` branches when building request headers: `bearer` → `Authorization: Bearer <webhook_secret>`; default → existing `X-PortAuNext-Schedule: <webhook_secret>` header. No behavior change for jobs that don't set it.

### 5.3 `deployment-manager`: parse + reconcile

New module, e.g. `deployment-manager/src/services/vercelCron.ts`:

- `readVercelCrons(projectDir): CronEntry[]` — reads `<projectDir>/vercel.json` if present, returns `[]` on missing file, missing/empty `crons`, or a JSON parse error (logs a warning in the latter case).
- `reconcileVercelCrons(app, appEnv, crons)` — using the app's own `PORT_SCHEDULE_URL` / `PORT_SCHEDULE_API_KEY` (already present in `appEnv` from `ensurePortScheduleForProductionApp`):
  1. `GET /v1/jobs` (paginated) and filter to `source === 'vercel'`.
  2. Diff against the desired set built from the current `vercel.json`.
  3. `POST` missing jobs (with `source: 'vercel'`), `PATCH` changed ones, `DELETE` (soft-delete) ones no longer declared.
  4. Any per-entry validation failure or HTTP error is logged and that entry is skipped — never throws out of the pipeline.

### 5.4 Pipeline wiring

In `runReleasePipeline` (`releasePipeline.ts`), add a step after `switchTraffic` succeeds, gated on `!isPreview` and `appEnv.PORT_SCHEDULE_URL` being set (i.e., `PORT_SCHEDULE_MASTER_API_KEY` configured on the platform):

```text
switchTraffic(...)
  → if (!isPreview && appEnv.PORT_SCHEDULE_URL) reconcileVercelCrons(app, appEnv, readVercelCrons(projectDir))
```

Placed after traffic switch (not during build) so cron reconciliation only happens for deploys that actually went live, and failures here never block a build or traffic cutover — logged as a warning, deploy status is unaffected.

### 5.5 Reconciliation identity

`source = 'vercel'` is the join key between "what's in the repo" and "what's in `port-schedule`", and `name` (the cron's `path`) is the key within that set. This is deliberate so:
- Reconciliation only ever touches jobs it created (`WHERE source = 'vercel'`, scoped to the app).
- Jobs created any other way (`source = 'api'` — manually, or by any future non-`vercel.json` integration) are never modified or deleted by this feature, regardless of what they're named.

---

## 6. Implementation phases

### Phase 1 — `port-schedule`: bearer auth mode + job source

- [x] Migration: `auth_scheme` column + `source` column, both with check constraints and backward-compatible defaults
- [x] `jobsRoutes.ts`: accept/return `auth_scheme` and `source` on create + update
- [x] `outbound.ts`: branch header construction on `auth_scheme`
- [ ] Unit/integration test: existing jobs (no `auth_scheme`/`source` supplied) still send the legacy header and read back as `source: 'api'`; a job with `auth_scheme: 'bearer'` sends `Authorization: Bearer` — *not yet added; `port-schedule` has no test suite today*

**Deliverable:** `port-schedule` can dispatch Vercel-compatible bearer-authenticated webhooks and tag a job's origin; fully backward compatible.

### Phase 2 — `deployment-manager`: parse `vercel.json` + reconcile on deploy

- [x] `vercelCron.ts`: read/parse/validate `crons[]`, translate to job payloads
- [x] Reconciliation logic: list `source: 'vercel'` jobs, diff, create/update/delete via the app's tenant API
- [x] Wire into `releasePipeline.ts` after `switchTraffic`, production-only, non-blocking on failure
- [x] Read `CRON_SECRET` from merged `appEnv`; omit auth when absent

**Deliverable:** deploying an app with a `vercel.json` `crons` array to production automatically creates/updates/removes matching `port-schedule` jobs, with no app code changes and no manual API calls.

### Phase 3 — Docs

- [x] README: `vercel.json` cron support section — supported fields, `CRON_SECRET` behavior, UTC-only schedules, how removal works
- [x] Note in docs that jobs remain visible/manageable only via the `port-schedule` API (no dashboard UI in this phase)

**Deliverable:** discoverable, documented behavior for anyone porting a Vercel app.

---

## 7. Acceptance criteria

1. Deploying a production app whose repo contains a `vercel.json` with a `crons` array creates matching `port-schedule` jobs, with no manual API calls.
2. The created jobs' `cron_expression`/`timezone`/`url`/`http_method` match the translation table in §5.1.
3. If the app defines `CRON_SECRET`, the job is created with `auth_scheme: 'bearer'` and that secret; `port-schedule` sends `Authorization: Bearer <secret>` when firing it, matching what a Vercel-authored cron route handler already checks for.
4. If the app does not define `CRON_SECRET`, the job is created with no auth header, and firing it does not error.
5. Editing a cron's `schedule` in `vercel.json` and redeploying updates the existing job (matched by `source: 'vercel'` + `path`) rather than creating a duplicate; editing `path` retires the old job and creates a new one (path is the identity key within `source: 'vercel'`).
6. Removing a cron entry from `vercel.json` and redeploying soft-deletes the corresponding job.
7. Jobs created manually via the `port-schedule` API (`source: 'api'`) are never modified by a deploy, regardless of name.
8. A missing `vercel.json`, an empty `crons` array, a malformed JSON file, or an invalid individual cron entry never fails the deploy — the deploy completes and a warning is logged.
9. Preview branch deploys never sync or modify `vercel:` jobs.
10. Existing (pre-feature) `port-schedule` jobs are unaffected — dispatch behavior and API responses are unchanged for jobs without `auth_scheme: 'bearer'`.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| App's `vercel.json` cron `path` doesn't exist / 404s once deployed here | Same failure mode as a broken URL on Vercel; `job_runs` records the failed HTTP status for visibility |
| Someone calls the tenant API directly with `source: 'vercel'` for a hand-made job, then loses it on the next reconcile | Requires the app's own `PORT_SCHEDULE_API_KEY` — already trusted access equivalent to editing `vercel.json` itself; document `source: 'vercel'` as reserved for pipeline-managed jobs |
| App relies on `CRON_SECRET` verification logic subtly different from Vercel's exact header format | Match Vercel's documented `Authorization: Bearer` format exactly; note in docs this is the only supported scheme translation |
| `vercel.json` present but authored for genuine Vercel-only use (other fields expected to do something) | Documented as out of scope; only `crons` is read, everything else silently ignored — no behavior surprise since nothing else is currently interpreted at all |
| Reconciliation runs on every production deploy even with no `vercel.json` changes | Diff is a no-op (list + compare) when nothing changed; negligible cost, same pattern as other idempotent per-deploy steps in the pipeline (e.g. `ensurePortScheduleForProductionApp`) |

---

## 9. Testing plan

| Case | Expected |
|------|----------|
| Deploy app with new `vercel.json` `crons` array | Jobs created with `source: 'vercel'`, matching translated fields |
| Redeploy with unchanged `vercel.json` | No duplicate jobs; existing jobs untouched (or updated only if `updated_at` changes, per idempotent diff) |
| Redeploy after changing a `schedule` | Existing job updated in place |
| Redeploy after removing a cron entry | Corresponding job soft-deleted |
| Deploy with no `vercel.json` | No-op, no errors, no jobs created |
| Deploy with malformed `vercel.json` | Deploy succeeds; warning logged; no jobs created/changed |
| Deploy with `CRON_SECRET` set | Job created with `auth_scheme: 'bearer'`; firing sends `Authorization: Bearer <value>` |
| Deploy with `CRON_SECRET` unset | Job created with no webhook secret; firing sends no auth header |
| Preview branch deploy with `vercel.json` present | No cron sync attempted |
| Manually created job (`source: 'api'`) | Untouched across multiple production deploys |

---

## 10. Future enhancements (not in this SOW)

- Dashboard visibility for `port-schedule` jobs generally (origin badge for `vercel:`-sourced jobs would fall out of that work)
- Auto-generating `CRON_SECRET` when absent, for apps that want auth without manually setting it
- Preview-branch cron sync with per-branch job namespacing and teardown
- Supporting additional `vercel.json` fields relevant to portability (e.g. `functions.maxDuration` mapped to a `port-schedule` timeout override)

---

## 11. References

| Resource | Location |
|----------|----------|
| `port-schedule` service | `port-schedule/src/` |
| Job dispatch | `port-schedule/src/http/outbound.ts`, `port-schedule/src/scheduler/tick.ts` |
| Job CRUD API | `port-schedule/src/routes/jobsRoutes.ts` |
| DB schema | `port-schedule/migrations/001_init.sql` |
| Release pipeline | `deployment-manager/src/services/releasePipeline.ts` |
| Env merge / tenant provisioning | `deployment-manager/src/services/appEnv.ts`, `deployment-manager/src/services/portSchedule.ts` |
| Existing ad hoc precedent | `apps/deportimetromx/src/instrumentation.ts` |
| Vercel: Cron Jobs | [vercel.com/docs/cron-jobs](https://vercel.com/docs/cron-jobs) |
