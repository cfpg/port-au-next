# Statement of Work: Cloudflare Routes for Platform `_HOST` Services

**Project:** Port-Au-Next — extend Cloudflare tunnel automation to platform services  
**Date:** 2026-06-17  
**Status:** Draft  
**Depends on:** [SOW-cloudflare-tunnel-automation.md](./SOW-cloudflare-tunnel-automation.md) (app routes, global settings, tunnel selection — **implemented**)

---

## 1. Executive Summary

Port-Au-Next already automates Cloudflare tunnel **published applications** and **proxied CNAME DNS** when users assign **app domains** and enable **preview branches**. Platform infrastructure services (deployment manager, MinIO, imgproxy, port-schedule, Umami) are exposed via root `.env` `*_HOST` variables and nginx `server_name` vhosts — but their tunnel routes are **not** synced today unless created manually in the Cloudflare dashboard.

This SOW defines work to **discover, connect, create, and sync** tunnel routes + DNS for every **public platform service** identified by a `*_HOST` environment variable in the root `.env`, using the same tunnel, origin URL (`http://localhost`), and read-modify-write ingress pattern as app routes.

Users still add domains to Cloudflare, point nameservers, and run `cloudflared` manually. This work only closes the gap between **platform env hostnames** and **Cloudflare tunnel public hostnames**.

---

## 2. Background

### 2.1 Current platform exposure model

| Layer | Responsibility |
|-------|----------------|
| Root `.env` | Declares public hostnames (`DEPLOYMENT_MANAGER_HOST`, `MINIO_HOST`, …) |
| `deployment-manager` startup | Writes nginx `service-*.conf` vhosts for most services (`setupImgproxy`, `setupMinio`, `setupPortSchedule`, `setupUmami`) |
| nginx | Routes by `server_name` → container IP |
| Cloudflare tunnel (manual today) | Published application per hostname → `http://localhost` → nginx |

### 2.2 What already exists (app-focused)

- **Settings → Cloudflare** — connect account, list/select/create tunnel, view published applications
- **`cloudflare_hostname_routes`** — tracks managed hostnames with `source_type` ∈ `app` \| `service` \| `preview_wildcard`
- **`syncServiceHostnameRoute(hostname, serviceName)`** in `cloudflareRoutes.ts` — **implemented but never called**
- **Per-app Cloudflare card** — status + Sync route for app domains and preview wildcards

### 2.3 Gap

After connecting Cloudflare and selecting a tunnel, a fresh install still requires **manual** published applications for:

- `DEPLOYMENT_MANAGER_HOST`
- `IMGPROXY_HOST`
- `MINIO_HOST`
- `PORT_SCHEDULE_HOST` (when set)
- `UMAMI_HOST` (when set)

Homelab operators who already have 16+ manual routes on `cfNet-Duo` / `cfNet-Uno` need a **Sync** path to adopt platform services without re-entering hostnames.

---

## 3. Goals

1. **Automatic sync on startup** — when Cloudflare is connected and a tunnel is selected, sync tunnel routes + DNS for all configured platform `_HOST` values after nginx vhosts are written.
2. **Dashboard visibility** — show per-service route/DNS status in Settings → Cloudflare (mirroring the per-app card pattern).
3. **Manual sync** — **Sync route** per service and **Sync all platform services** bulk action.
4. **External route adoption** — existing manual routes show as **External** until synced; sync is idempotent and non-destructive to other tunnel ingress rules.
5. **Consistency** — reuse `cloudflareTunnel.addPublishedApplication`, `source_type: 'service'`, `source_id: <serviceId>`.

---

## 4. Scope

### 4.1 In scope

| Item | Detail |
|------|--------|
| Platform `_HOST` registry | Canonical list of public host env keys → service metadata |
| Startup hooks | Call `syncServiceHostnameRoute` after each successful nginx vhost setup (and for deployment manager) |
| Status API + UI | Service-level readiness, route status, DNS check, zone info |
| Sync API | Per-service and bulk sync endpoints |
| Route removal | When a managed service hostname is cleared/unset on restart, remove managed route (optional services only) |
| Docs | README + Settings helper text |

### 4.2 Out of scope

| Item | Reason |
|------|--------|
| `POSTGRES_HOST` | Internal Docker DNS name (`postgres`), not a public hostname |
| `PORT_SCHEDULE_HOST_PORT` | Host port mapping, not a hostname |
| `NEXT_PUBLIC_*` host vars | Derived from platform vars at deploy time; not root `.env` service endpoints |
| Per-app `_HOST` injection (`IMGPROXY_HOST` in app containers) | Apps consume platform hostnames; routes are for the **platform** hostname once |
| Editing `.env` from the UI | Hostnames remain in root `.env`; user restarts stack after changes |
| Running `cloudflared` | Remains manual |
| Zone onboarding / nameservers | Remains manual |
| Per-service origin URL override | All platform services use the selected tunnel’s `tunnel_origin_url` (default `http://localhost`) |
| MinIO console separate hostname | Single `MINIO_HOST` only (current nginx model) |

### 4.3 User responsibilities (unchanged)

1. Add each service domain/subdomain to Cloudflare
2. Point registrar nameservers at Cloudflare
3. Set `*_HOST` values in root `.env` and restart `deployment-manager`
4. Run `cloudflared service install <token>` for the selected tunnel

---

## 5. Platform service inventory

Canonical registry (single source of truth in code, e.g. `platformServiceHosts.ts`):

| `source_id` | Env var | Required | Nginx vhost today | Notes |
|-------------|---------|----------|-------------------|-------|
| `deployment-manager` | `DEPLOYMENT_MANAGER_HOST` | **Yes** | `default.conf` only (no dedicated `server_name`) | Recommend adding explicit `service-deployment-manager.conf` for parity with other services |
| `imgproxy` | `IMGPROXY_HOST` | **Yes** | `service-imgproxy.conf` | Startup throws if unset |
| `minio` | `MINIO_HOST` | **Yes** | `service-minio.conf` | Startup throws if unset |
| `port-schedule` | `PORT_SCHEDULE_HOST` | Optional | `service-port-schedule.conf` | Skipped when unset |
| `umami` | `UMAMI_HOST` | Optional | `service-umami.conf` | Skipped when unset |

**Inclusion rule:** any root `.env` variable matching `*_HOST` that maps to a **public nginx vhost** (not internal Docker service names) is in scope. The registry is explicit to avoid accidentally syncing `POSTGRES_HOST`.

**Hostname validation:** reuse `normalizeHostname()` — reject empty, whitespace, URLs with scheme, or paths.

---

## 6. Technical design

### 6.1 Sync flow (per service)

```
Read env HOST value
  → if empty (optional service): remove managed route if we own it; stop
  → if Cloudflare not connected / no tunnel: no-op (status = not_ready)
  → cloudflareTunnel.addPublishedApplication({
        hostname,
        sourceType: 'service',
        sourceId: serviceId,
     })
  → upsert cloudflare_hostname_routes row
```

`addPublishedApplication` already:

1. Resolves zone for hostname
2. Read-modify-writes tunnel ingress (preserves external rules)
3. Creates or updates proxied CNAME → `{tunnelId}.cfargotunnel.com`

### 6.2 Startup integration

Extend `instrumentation.ts` startup sequence **after** nginx vhost steps:

```text
setupMinio()           → syncServiceHostnameRoute(MINIO_HOST, 'minio')
setupImgproxy()          → syncServiceHostnameRoute(IMGPROXY_HOST, 'imgproxy')
setupPortSchedule()      → sync if PORT_SCHEDULE_HOST set
setupUmami()             → sync if UMAMI_HOST set
setupDeploymentManager() → NEW: optional explicit vhost + sync DEPLOYMENT_MANAGER_HOST
```

Failures should **log + warn** but not block startup (unlike missing `IMGPROXY_HOST` for nginx). Cloudflare sync is best-effort at boot; user can retry from UI.

### 6.3 Hostname changes

Platform hostnames live in `.env` and are loaded at container start. When a hostname changes:

1. User updates `.env` and restarts `deployment-manager`
2. Startup writes new nginx vhost
3. Sync creates route for **new** hostname
4. Sync removes **previous** managed route for same `source_id` if hostname differed (query `cloudflare_hostname_routes` where `source_type = 'service'` and `source_id = ?`)

### 6.4 Status computation

Reuse `HostnameCloudflareStatus` from `cloudflareAppStatus.ts` (extract shared helper if needed):

| Status | Condition |
|--------|-----------|
| `not_configured` | Env var empty (optional services) |
| `not_ready` | Cloudflare disconnected or no tunnel selected |
| `synced` | Managed route in DB + ingress match + proxied CNAME correct |
| `external` | Hostname on tunnel ingress but not in `cloudflare_hostname_routes` |
| `missing_route` | Hostname set, zone OK, no ingress rule |
| `missing_dns` / `dns_wrong` | Ingress OK, DNS mismatch |
| `zone_not_found` / `zone_pending` | Zone lookup issues |

### 6.5 Database

No schema migration required — `source_type: 'service'` and `source_id` already supported.

Optional convenience index:

```sql
CREATE INDEX IF NOT EXISTS idx_cloudflare_hostname_routes_service
ON cloudflare_hostname_routes(source_type, source_id)
WHERE source_type = 'service';
```

### 6.6 Deployment manager nginx vhost (recommended)

Today `DEPLOYMENT_MANAGER_HOST` works via nginx `default_server` (`nginx/conf.d/default.conf`). For consistent `server_name` routing and to match other platform services:

- Add `setupDeploymentManager()` in `startup.ts`
- Write `service-deployment-manager.conf` with `server_name ${DEPLOYMENT_MANAGER_HOST}`
- Consider narrowing `default.conf` to a catch-all or internal-only behavior (follow-up if needed; document breaking-change risk)

---

## 7. Cloudflare dashboard parity

Platform service sync replicates the same screens documented in the parent SOW §6:

| Cloudflare UI | Platform service behavior |
|---------------|---------------------------|
| **Zero Trust → Networks → Connectors → Tunnels → [tunnel] → Published application routes** | One row per `*_HOST` hostname; Service = `http://localhost` (or configured origin) |
| **Add a published application** | Subdomain + domain from env hostname; Path `/`; Type = Published application |
| **DNS → Records** | Proxied CNAME `@` or subdomain → `{tunnel-id}.cfargotunnel.com` |

Settings → Cloudflare **Published applications** table should label platform rows with source **service** (`minio`, `imgproxy`, …) distinct from **app** and **preview_wildcard**.

---

## 8. API surface

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/cloudflare/services` | List platform services with hostname, route status, DNS status, managedBy |
| `POST` | `/api/cloudflare/services/[serviceId]/sync` | Sync one service (`deployment-manager`, `minio`, …) |
| `POST` | `/api/cloudflare/services/sync-all` | Sync all configured platform hostnames |

All endpoints require authenticated deployment-manager session. Return `{ success, error?, zoneId? }` consistent with `/api/apps/[appId]/cloudflare`.

---

## 9. UI / UX

### 9.1 Settings → Cloudflare — **Platform services** section

New block below tunnel selection / above or within published applications:

| Column | Content |
|--------|---------|
| Service | Human label (Deployment manager, MinIO, imgproxy, …) |
| Hostname | From env (read-only; link to `.env` docs) |
| Route status | Badge: Synced / External / Missing route / … |
| DNS | Proxied CNAME present / missing / wrong |
| Actions | **Sync route** (per row) |

Footer: **Sync all platform services** button (disabled when not connected or no tunnel).

Helper text:

> Platform hostnames come from root `.env` (`DEPLOYMENT_MANAGER_HOST`, `MINIO_HOST`, …). After changing them, restart the deployment-manager container, then sync routes here.

### 9.2 Published applications table enhancement

When `sourceType === 'service'`, show service id in **Managed by** column, e.g. `Port-Au-Next (minio)`.

### 9.3 No per-service settings page

Platform services are global — status lives only under Settings → Cloudflare (not under individual apps).

---

## 10. Implementation phases

### Phase 1 — Registry + sync wiring (backend)

- [ ] Add `platformServiceHosts.ts` registry
- [ ] Extend `syncServiceHostnameRoute` with previous-hostname cleanup by `source_id`
- [ ] Call sync from startup after each `setup*()` vhost function
- [ ] Add `setupDeploymentManager()` + nginx vhost (recommended)
- [ ] Add `cloudflareServiceStatus.ts` (or extend `cloudflareAppStatus.ts`)

**Deliverable:** On restart with Cloudflare connected, all configured `*_HOST` services get tunnel routes + DNS without manual dashboard work.

### Phase 2 — API

- [ ] `GET /api/cloudflare/services`
- [ ] `POST /api/cloudflare/services/[serviceId]/sync`
- [ ] `POST /api/cloudflare/services/sync-all`

**Deliverable:** Scriptable sync; powers UI.

### Phase 3 — Settings UI

- [ ] `CloudflarePlatformServicesCard` or section in `CloudflareSettingsCard`
- [ ] Per-service status badges + Sync route
- [ ] Sync all button + toasts
- [ ] Enhance published applications table with service labels

**Deliverable:** Operator can see and fix platform route gaps without Cloudflare dashboard.

### Phase 4 — Docs + polish

- [ ] README — platform `_HOST` sync section
- [ ] `.env.example` comments — “tunnel route synced when Cloudflare connected”
- [ ] Settings accordion — list of platform env vars
- [ ] Marketing site FAQ (optional one-liner)

**Deliverable:** Discoverability for homelab setup.

---

## 11. Acceptance criteria

1. With Cloudflare connected, tunnel selected, and valid `MINIO_HOST` / `IMGPROXY_HOST` / `DEPLOYMENT_MANAGER_HOST` in `.env`, restarting deployment-manager creates published applications + proxied CNAMEs for each without manual Cloudflare edits.
2. Optional `PORT_SCHEDULE_HOST` and `UMAMI_HOST` sync when set; no sync when unset; no errors when unset.
3. Settings → Cloudflare shows all five platform services with accurate status.
4. **Sync route** on a service with an existing manual ingress adopts it into `cloudflare_hostname_routes` without deleting unrelated tunnel routes.
5. Changing `MINIO_HOST` in `.env` and restarting removes the old managed MinIO route and creates the new one.
6. `POSTGRES_HOST` is never synced or shown in platform services UI.
7. Startup completes successfully if Cloudflare API is temporarily unavailable (sync fails softly; UI shows actionable error).

---

## 12. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| `DEPLOYMENT_MANAGER_HOST` vs `default_server` ambiguity | Add explicit nginx vhost in Phase 1 |
| Env changes require container restart | Document clearly; future UI edit is out of scope |
| Duplicate hostnames across services | Registry validation: reject duplicate hostnames across platform services at sync time |
| Same hostname used for app + service | `normalizeHostname` collision check; warn if app domain equals platform host |
| Rate limits on Cloudflare API | Reuse tunnel lock; bulk sync serializes per tunnel |
| External routes with same hostname | Sync adopts ingress; do not delete external rules user did not create via Port-Au-Next |

---

## 13. Testing plan

| Case | Expected |
|------|----------|
| Fresh install, CF connected | All required `_HOST` routes synced after startup |
| CF not connected | Status `not_ready`; no API errors on startup |
| Manual route exists | Status `external` until Sync route |
| Unset `UMAMI_HOST` | Umami row `not_configured`; no route created |
| API token lacks DNS permission | Sync fails with clear error; status `missing_dns` after partial ingress write |
| Ingress read-modify-write | Unrelated external hostnames on tunnel unchanged |

Manual test against live account with existing tunnels (`cfNet-Duo`, `cfNet-Uno`) recommended.

---

## 14. Future enhancements (not in this SOW)

- **`.env` editor** in dashboard with live reload + auto-sync
- **OAuth** Cloudflare connect flow
- **Health check** per platform service (HTTP 200 via tunnel)
- **Separate MinIO console hostname** (`MINIO_CONSOLE_HOST`)
- **Webhook** on `.env` file change for sync without full restart
- **Cache purge** for imgproxy/CDN hostnames on deploy (today purge is per-app zone)

---

## 15. References

| Resource | Location |
|----------|----------|
| Parent SOW | `docs/SOW-cloudflare-tunnel-automation.md` |
| Service sync stub | `deployment-manager/src/services/cloudflareRoutes.ts` → `syncServiceHostnameRoute` |
| Nginx vhost setup | `deployment-manager/src/lib/startup.ts` |
| Route tracking | `deployment-manager/src/queries/cloudflareHostnameRoutesQuery.ts` |
| Root env template | `.env.example` |
| Cloudflare: Published applications | [Cloudflare Tunnel public hostnames](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/create-local-tunnel/#add-a-tunnel-route) |
