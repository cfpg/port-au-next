# Shared Preview Database

**Status:** proposed  
**Depends on:** existing preview branches (isolated Postgres per branch), preview MinIO
ensure-on-env-assembly (`ensurePreviewAppStorage`)

---

## 1. Problem

Preview branches each get a dedicated Postgres database
(`{app}_{branch-slug}_db`) created in `setupPreviewBranch`. That database is
empty: no schema unless **auto-migrate** is on, and no application data unless
the operator seeds it.

For Delay, that means a preview of `feature/minisite-redesign` cannot render
production minisites (`/surisbasuri` 500s) because it is not using `delaymx_db`.
Migrating and registering accounts on every git branch does not scale.

Preview MinIO already uses the opposite grain: **one bucket per app**, shared by
every preview branch of that app. Postgres should follow the same model.

---

## 2. Goal

One Postgres database per app for **all** of that app's preview branches.

- First preview deploy (or first preview-branch provision) creates
  `{app}_preview_db` / `{app}_preview_user` if missing.
- Later preview branches reuse the same credentials and `DATABASE_URL`.
- Deleting one preview branch does **not** drop the database.
- Deleting the **app** drops the shared preview database.
- Production (`apps.db_name`, e.g. `delaymx_db`) is unchanged.

This document does **not** clone production data into that database. Schema and
data still need auto-migrate, a one-shot dump/restore, or a seed. Those are
follow-up (see §8).

---

## 3. What this adds

- Idempotent `ensurePreviewAppDatabase(app)` analogous to
  `ensurePreviewAppStorage(app)`.
- Credentials stored once in `app_services` (`service_type = 'preview_database'`,
  `is_preview = true`), same pattern as `test_database`.
- Preview deploys inject `POSTGRES_*` / `DATABASE_URL` from that row, not from a
  per-branch `CREATE DATABASE`.
- Preview-branch teardown stops the container and removes nginx only.
- App deletion drops `{app}_preview_db` once.

## 4. What this does not add

- Cloning or seeding from production (`delaymx_db` → preview).
- Pointing previews at the production database.
- A dashboard toggle to choose isolated vs shared (v1 is shared for every app
  that uses preview branches).
- Automatic cleanup of **legacy** per-branch databases already created
  (`delaymx_feature_minisite_redesign_ca4759_db`, etc.). Operators may drop those
  manually after cutover (see §7).
- Changing auto-migrate semantics beyond documenting the new risk: if
  `auto_migrate` is on, **every** preview deploy runs `prisma migrate deploy`
  against the **same** database (last deploy wins).

---

## 5. Design

### 5.1 Grain

| Resource | Production | Preview (after this) |
|---|---|---|
| Postgres | `{app}_db` on `apps` | `{app}_preview_db`, one per app |
| MinIO | `{app}-bucket` | `{app}-preview-bucket` (already) |
| Subdomain / container | app domain | still per branch |

Concurrent preview branches share schema and rows. Two feature branches that
ship conflicting Prisma migrations can break every `{slug}.{preview_domain}`
until the shared DB is repaired or reset. That is accepted for v1.

### 5.2 Credential storage

Reuse `app_services` (unique on `app_id, service_type, is_preview`):

| Column | Value |
|---|---|
| `service_type` | `preview_database` |
| `is_preview` | `true` |
| `public_key` | database name (`delaymx_preview_db`) |
| `username` | role (`delaymx_preview_user`) |
| `password` | role password |
| `enabled` | `true` |

Do **not** put production Postgres in `app_services`; it stays on `apps`.

`preview_branches.db_name` / `db_user` / `db_password` remain populated with a
**copy** of the shared credentials so recovery (`docker.ts`) and deploy
injection that already read those columns keep working without a join change.
They are denormalized, not a second database.

Constant: `PREVIEW_DATABASE_SERVICE_TYPE = 'preview_database'` next to
`TEST_DATABASE_SERVICE_TYPE`.

Naming: `setupAppDatabase(\`${app.name}_preview\`)` → `delaymx_preview_user` /
`delaymx_preview_db` (same sanitization as production and test DBs).

### 5.3 Ensure helper

`ensurePreviewAppDatabase(app): Promise<{ dbName, dbUser, dbPassword }>` in
`deployment-manager/src/services/previewDatabase.ts` (or beside
`testDatabase.ts`):

1. If an `app_services` row exists with name/user/password, return it
   (optionally `ALTER USER` is **not** required on every call; test-database
   reuses the stored password).
2. Otherwise `setupAppDatabase(\`${app.name}_preview\`)` and upsert
   `app_services`.
3. Handle unique-violation `23505` like MinIO/port-schedule: refetch and return.

Call sites:

- `setupPreviewBranch` — **before** inserting `preview_branches`; use returned
  creds on the row. Do **not** call `setupAppDatabase` with a branch slug.
- `deployPreviewBranch` / `mergeAppEnv` path — inject from the row (already on
  `previewBranch` after setup). Optionally call ensure again so a restore of a
  soft-deleted branch still has a live database if the app_services row exists
  but the cluster DB was dropped.
- Failed insert of `preview_branches` must **not** `deleteAppDatabase` the
  shared DB (today it deletes the just-created per-branch DB). Compensation
  becomes a no-op for Postgres.

### 5.4 Deploy env

`deployPreviewBranch` already builds:

```ts
POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB / POSTGRES_HOST / DATABASE_URL
```

from `previewBranch.db_*`. After cutover those fields hold the shared preview
database, so this block stays as-is.

### 5.5 Teardown

`cleanupPreviewBranchResources` and the preview-branch path in
`apps/[appName]/actions.ts` (`deletePreviewBranch`):

- Keep: stop container, delete nginx preview server block.
- **Skip** `deleteAppDatabase` when `db_name` equals the shared preview
  database (`app_services.public_key` for `preview_database` / `is_preview=true`,
  or name `{sanitizedApp}_preview_db`).

App deletion (`deleteApp` / `deleteAppRecord`):

- After preview branch resource cleanup (containers/nginx only), drop
  `{app}_preview_db` / `{app}_preview_user` **once** via
  `deleteAppDatabase`, using the `app_services` row.
- Then delete `app_services` / `apps` as today.

If cleanup skipped the drop because of sharing, app delete is the only place
that removes the cluster database. Do not drop it while any
`preview_branches` row still needs it; app delete already cleans those rows
after resource cleanup.

### 5.6 Recovery

`docker.ts` recovery uses `deployment.db_user` / `db_name` from the preview
join. Denormalized copies on `preview_branches` keep that path valid.

---

## 6. Lifecycle

| Event | Postgres action |
|---|---|
| Enable preview branches | No database yet (same as today) |
| First `setupPreviewBranch` / first preview deploy | Ensure `{app}_preview_db` |
| Second preview branch | Reuse `app_services` row; copy creds onto the new `preview_branches` row |
| Redeploy same branch | No-op lookup |
| Delete one preview branch | Container + nginx only |
| Delete last preview branch | Still keep `{app}_preview_db` (empty of branches, data retained for the next preview) |
| Delete app | Drop `{app}_preview_db` and role |
| Auto-migrate on | `prisma migrate deploy` against the shared DB on **every** preview deploy |

---

## 7. Existing preview databases

Apps that already have per-branch databases (Delay: `delaymx_feature_*_db`)
are not migrated automatically.

- New preview provision after this ships uses `delaymx_preview_db`.
- Old `preview_branches` rows still point at their private DBs until the branch
  is deleted and recreated, or an operator updates the row to the shared creds
  (out of scope for v1).
- After cutover, unused `{app}_{slug}_db` databases are safe to drop by hand.

Optional later: a one-shot backfill that rewrites existing `preview_branches`
to the shared creds and drops the old databases. Not required to ship.

---

## 8. Follow-ups (out of scope)

1. **Clone from production** into `{app}_preview_db` on first ensure or via a
   “Reset preview data from production” action (`pg_dump` / `pg_restore`).
   That is what makes `/surisbasuri` work without registering accounts.
2. **Auto-migrate policy for shared preview** — e.g. only migrate from the
   app’s production branch name, or a warning in the Prisma card that preview
   deploys share one schema.
3. **Per-app toggle** isolated vs shared, if someone needs both models.

---

## 9. Files to change

| Area | Files |
|---|---|
| Ensure + types | New `deployment-manager/src/services/previewDatabase.ts` |
| Provision | `services/previewBranches.ts` (`setupPreviewBranch`, `cleanupPreviewBranchResources`) |
| App delete | `app/(dashboard)/apps/[appName]/actions.ts`, `services/database.ts` (`deleteAppRecord`) |
| Tests | `previewBranches` / new `previewDatabase.test.ts`; teardown must not drop shared DB while another branch exists |
| Copy | Prisma card or Preview Branches card: one line that previews share a database |

No schema migration beyond using existing `app_services` columns. No change to
`apps.db_*`.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Feature-branch migration bricks all previews | Document; keep auto-migrate off unless accepted; follow-up policy in §8.2 |
| Branch delete drops the shared DB | Explicit skip in cleanup when `db_name` is the shared preview database |
| Failed `preview_branches` insert drops a DB other branches use | Remove `deleteAppDatabase` from the setup compensation path for the shared DB |
| `setupAppDatabase` `ALTER USER` on existing role | Ensure path should **return stored password**, not rotate, or every container’s `DATABASE_URL` would need a redeploy |
| Legacy per-branch DBs leak | Document manual drop; optional backfill later |

---

## 11. Test plan

- First preview branch for an app creates `{app}_preview_db` and one
  `app_services` row; `preview_branches.db_name` matches.
- Second preview branch does not `CREATE DATABASE`; same `db_name` / `db_user`.
- Delete one of two preview branches: cluster database still exists; remaining
  branch deploy still connects.
- Delete last preview branch: database still exists.
- Delete app: `{app}_preview_db` and role are gone.
- Production `apps.db_name` never changes.
- Unique-violation race on first two concurrent preview provisions: both
  succeed with the same credentials.
- Compensation after a failed `preview_branches` insert does not drop an
  already-shared database.

Manual: Delay preview `/` still boots; `/surisbasuri` still 500/404 until
schema+data exist (expected until §8.1).
