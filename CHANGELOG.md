# Changelog
All notable changes to Port-Au-Next will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Umami analytics:** Shared Umami instance with per-app opt-in provisioning (team, website, dashboard login), production-only `NEXT_PUBLIC_UMAMI_*` env injection, domain sync on app settings change, and Analytics settings UI.
- **Umami admin bootstrap:** Deployment manager syncs `UMAMI_ADMIN_*` from `.env` to Umami on startup (replaces default `admin`/`umami` on first boot).

### Changed

- Deploy env assembly is centralized in `mergeAppEnv()` so production, preview, recovery, and the release pipeline all inject the same platform-managed variables (Minio, Imgproxy, port-schedule, Umami, site URL).

### Fixed

- **Release pipeline env vars:** Redeploys no longer omit platform-injected reserved keys (`MINIO_HOST`, `IMGPROXY_HOST`, etc.) from the build `.env`, fixing Next.js build failures for apps that validate those variables at build time.
- **Nginx deployment logs:** Per-deployment log directories are created via the nginx container with correct ownership, fixing `EACCES` errors during startup container recovery after 0.5.0 logging was enabled.

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