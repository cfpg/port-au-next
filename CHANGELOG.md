# Changelog
All notable changes to Port-Au-Next will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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