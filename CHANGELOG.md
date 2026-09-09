# Changelog
All notable changes to Port-Au-Next will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Deployment-manager design system:** New UI Kit foundation (color, spacing, typography, radius, shadow, and motion tokens) and a full set of primitive and composite components (buttons, inputs, selects, switches, badges, tables, panels, modals, menus, callouts, and more) used throughout the dashboard.
- **Applications table search, filtering, sorting, and pagination:** The Applications list now supports filtering by name/domain/repo, filtering by status, sorting by name, and pagination, replacing the previous unfiltered static list.
- **Shared `Popover` primitive:** Dropdown menus, split-button menus, and tooltips now share one positioning primitive that portals its content to escape clipping ancestors (e.g. a scrollable table) and computes placement from the trigger's actual position, instead of each reimplementing its own open/close and positioning logic.

### Changed

- **Deployment-manager dashboard redesign:** Every dashboard page (Dashboard, Applications, App detail, App settings, Environment variables, Deployment logs, Settings) and the login/logout pages now use the new design system in place of the previous ad hoc styling.
- Settings toggles (Uses Prisma, Test Database, Analytics, Error Tracking, Preview Branches) now use a single switch control instead of separate "Enabled"/"Disabled" buttons.
- Deployment history row actions are now a single overflow menu (view logs, redeploy, copy commit SHA) instead of multiple buttons per row.
- Services Health now appears before Cloudflare on the Settings page.

### Fixed

- **Split-button dropdown overflow:** The Deploy button's dropdown in the Applications table no longer overflows the table and forces a horizontal scrollbar; it now opens toward whichever side has room.
- **Button/icon-button height mismatch:** Buttons and their adjacent icon-only controls (e.g. the row overflow menu) now render at consistent heights.
- **Class-merging conflicts:** Custom typography, radius, shadow, and motion utility classes no longer collide with unrelated Tailwind utility classes when combined on the same element, which could previously cause one of them to be silently dropped (e.g. button text losing its color).
- Switch controls in settings rows now align to the right edge of their row instead of sitting flush against the label text.
- The "View Logs" action in the deployment history table no longer wraps onto two lines.

## [0.6.1] - 2026-09-08

### Added

- **Deployment readiness:** Deployment manager now exposes an explicit readiness endpoint used by Docker Compose to sequence nginx startup without making nginx part of the manager's critical startup path.
- **Health-gated application cutovers:** New production and preview containers must pass Docker and HTTP readiness checks before nginx switches traffic to them.

### Changed

- **Docker DNS routing:** Application vhosts now route through immutable per-deployment network aliases, while platform-service vhosts use stable Compose service names. Existing deployments use their unique container names until their next deployment.
- **Resilient nginx reconciliation:** Generated configurations are written atomically, validated before reload, serialized, retried when nginx is temporarily unavailable, and rolled back when a cutover cannot be applied safely.
- **Startup recovery:** Container recovery now reconciles active production and preview routes through Docker DNS and cleans up duplicate active deployment records without blocking deployment-manager readiness.
- Generated production and preview app Nginx vhosts now accept request bodies up to 10 MB, allowing image and file uploads larger than Nginx's 1 MB default.

### Fixed

- **Deployment-manager/nginx restart loop:** Rebuilding or simultaneously restarting the services no longer leaves each waiting for the other to become ready.
- **Cross-domain routing after container recreation:** Nginx no longer retains recycled container IPs that can later belong to a different application or platform service.
- **Failed deployment cutovers:** Unhealthy candidates and nginx reload failures leave the previous active route in place instead of publishing an unavailable upstream.

## [0.6.0] - 2026-08-29

### Added

- **Optional test databases:** Apps can provision a persistent, empty PostgreSQL test database with separate credentials. Production builds and containers receive `TEST_DATABASE_URL` and `TEST_POSTGRES_*`; disabling retains data and deleting the app removes the database.
- **Bugsink error tracking:** Shared Sentry-compatible Bugsink service with per-app opt-in team/project provisioning, encrypted platform API-token bootstrap, production DSN injection, and dashboard configuration.
- **Umami analytics:** Shared Umami instance with per-app opt-in provisioning (team, website, dashboard login), production-only `NEXT_PUBLIC_UMAMI_*` env injection, domain sync on app settings change, and Analytics settings UI.
- **Umami admin bootstrap:** Deployment manager syncs `UMAMI_ADMIN_*` from `.env` to Umami on startup (replaces default `admin`/`umami` on first boot).
- **Cloudflare tunnel management:** Connect Cloudflare with a scoped API token, select or create tunnels, and manage app routes and proxied DNS from the deployment manager.
- **Platform service route sync:** Synchronize deployment-manager, MinIO, imgproxy, port-schedule, Umami, and Bugsink hostnames with the selected Cloudflare tunnel.
- **Environment export:** Export the effective production environment for deployed, localhost, or Docker/WSL Postgres hosts, including platform-managed service credentials.
- **Monorepo project paths:** Configure an app root path so Next.js projects can be deployed from repository subdirectories.
- **Marketing site:** New standalone product site covering features, shared infrastructure, installation, and FAQs.

### Changed

- **Project-scoped production environment:** Production variables now use `branch = NULL` and remain available when the configured production branch changes. Existing rows are migrated automatically; preview variables remain separately classified and may be shared or branch-specific.
- Deploy env assembly is centralized in `mergeAppEnv()` so production, preview, recovery, and the release pipeline inject the same platform-managed variables (MinIO, imgproxy, port-schedule, Umami, Bugsink, test database, and site URL).
- Nginx configuration storage is verified and initialized when the deployment manager starts.
- Release automation now validates the changelog and branch state, creates the release commit and annotated tag, pushes `main`, and synchronizes `dev` after release.

### Fixed

- **Release pipeline env vars:** Redeploys no longer omit platform-injected reserved keys (`MINIO_HOST`, `IMGPROXY_HOST`, etc.) from the build `.env`, fixing Next.js build failures for apps that validate those variables at build time.
- **Nginx deployment logs:** Per-deployment log directories are created via the nginx container with correct ownership, fixing `EACCES` errors during startup container recovery after 0.5.0 logging was enabled.
- **Nginx upstream validation:** Empty or invalid container upstreams no longer produce stale vhosts; reloads validate configuration inside the nginx container and safely handle an unavailable nginx service.
- **Cloudflare database usage:** Route synchronization uses the shared database pool safely.
- **Bugsink provisioning:** Corrected CSRF handling and per-app project provisioning behavior.

## [0.5.0] - 2026-05-30

### Added

- **Deployment logging:** Per-deployment build logs (`apps/logs/{app}/{id}/`), nginx access/error logs (`nginx/logs/apps/{app}/{id}/`), secret redaction in deploy logs, UI tabs (Deploy / Build / Access / Error), and 90-day cleanup after `inactive` or `failed`.
- **Uses Prisma:** Platform-generated Dockerfiles when the feature is enabled and the app has no custom `Dockerfile` — Node 24, `prisma generate` at build, marker line `# generated-by-port-au-next v1 -uses_prisma` with version/flag regeneration on deploy.
- **Auto-migrate on deploy:** Nested setting under Uses Prisma (`auto_migrate`, default off). When enabled, deploy runs preflight → `prisma migrate deploy` in a `{app}:{version}-migrate` job (`migrate status` logged only) → nginx switch. New deployment statuses `preflight` and `migrating`. README expand/contract guidance.

### Changed

- Prisma platform Dockerfile: `npm ci --ignore-scripts` in deps, then `prisma generate` after full source copy; adds **`migrator`** build stage (marker `v5`); avoids BuildKit `required=false` bind mounts.
- Production and preview deploys use a shared release pipeline (build → preflight → optional migrate → traffic switch) instead of flipping nginx immediately after container start.
- deployment-manager image installs `docker-buildx` CLI plugin (Alpine `docker-cli` does not include it).
- Bulk import environment variables from pasted `.env` content (skips existing and platform-reserved keys).
- Deployment pipeline logs redact env secrets; full docker build output is stored on disk only (not in Postgres metadata).

### Fixed

- Deployment log viewer: multiline metadata (e.g. Prisma `output`), Build tab for docker build files, and per-line build log severity styling.

## [0.4.5] - 2025-05-11

### Added

### Fixed
* Fix/recover containers on next startup and updates nginx config with correct internal ip for running containers

### Security

### Changed

## [0.4.4] - 2025-04-11

### Added

### Fixed
* Fix/env var generation for deployed apps 

### Security

### Changed

## [0.4.3] - 2025-04-08

### Added

### Fixed
* Fix/setup db clone repo on create app 

### Security

### Changed

## [0.4.2] - 2025-04-07

### Added
* Feature/imgproxy 

### Fixed
* Fix/docker build env vars 

### Security

### Changed

## [0.4.1] - 2025-04-07

### Added
* Feature/minio object storage service 

### Fixed
* HOTFIX: Upates README;
* HOTFIX: Updates release script to use --ff-only when merging dev into main to avoid extra merge commits
* HOTFIX: Fixes syntax error in release script
* HOTFIX: Fixes release script by removing duplicate merge blocks and fixing syntax
* HOTFIX: Fixes changelog generation in release script

### Security

### Changed
* chore: sync dev with main after release 0.4.0

## [0.4.0] - 2025-04-07

### Added

### Fixed

### Security

### Changed

## [0.3.0] - 2024-03-21

### Added
* Feature/user management
* Feature/preview branches
* Feature/preview branches management

### Fixed
* Fixes toast notifications with sonner
* HOTIFX: Removes building and calling scripts/migrate.ts from deployment-manager/Dockerfile

### Changed
* Adds new User Management related env vars to docker-compose

## [0.1.0] - 2025-03-17

### Added
- Initial release of Port-Au-Next
- Blue/green deployment strategy for Next.js applications
- Multi-tenant application support
- Environment variables management per app/branch
- Deployment logs system
- Cloudflare integration for cache management
- Docker container recovery system
- Web-based management UI
- Nginx reverse proxy with caching optimizations
- Default Dockerfile generation for Next.js apps
- GitHub integration for automated deployments

### Fixed
- Trailing comma issue in next.config file
- Nginx IP configuration after container recovery
- Proxy buffer size for deployed apps
- Next.js image optimization and caching
- Docker build logging improvements

### Security
- Updated axios to 1.8.2 for security patches
