# Port-Au-Next

![Port-Au-Next Logo](https://portaunext.cfpg.me/port-au-next-banner@2x.png)

**A no-downtime multi-tenant Next.js self-host deployment manager**

## Overview

Port-Au-Next allows you to self-host multiple Next.js applications using Docker containers. It uses blue/green deployments to update your apps without any downtime - when a new version is ready, traffic switches over seamlessly. You maintain full control of your infrastructure without being locked into cloud platforms.

Whether you're deploying to a VPS, cloud server, or hardware in your own environment, Port-Au-Next provides an elegant solution for managing your Next.js application fleet with secure user authentication and powerful preview branch capabilities.

## Key Features

- **Blue/Green Deployments**: Seamless deployments with zero downtime using a true blue/green strategy
- **Multi-Tenancy**: Host multiple Next.js applications on a single server
- **Domain Management**: Connect multiple domains/subdomains to specific applications and branches
- **Preview Branches**: Deploy and test feature branches with isolated environments and custom subdomains
- **User Authentication**: Secure admin interface with user management and authentication
- **GitHub Actions Integration**: Automatically deploy when pushing to configured branches
- **Health Checks**: Intelligent service switching only when new deployments are verified healthy
- **Environment Isolation**: Each app, branch, or preview deployment can have its own environment variables
- **Customizable Build Process**: Use the default optimized Dockerfile or create your own
- **Shared Infrastructure**: PostgreSQL, Redis, imgproxy, and **port-schedule** (HTTP cron / webhook scheduler) available to all applications
- **Web-Based Management UI**: Monitor and control your deployments through an intuitive interface

## Architecture

Port-Au-Next uses a Docker-based microservices architecture with the following components:

1. **Nginx Reverse Proxy**: Routes traffic to the correct application containers and preview branch deployments
2. **Deployment Manager**: Web UI and API for managing applications and deployments, with secure authentication
3. **Authentication Layer**: Handles user authentication and session management
4. **Preview Branch Manager**: Manages isolated preview environments for feature branches
5. **Shared Services**: PostgreSQL, Redis, imgproxy, and **port-schedule** (per-app API keys; schedules outbound HTTP to your apps’ public URLs)
6. **Application Containers**: Isolated containers for each application version and preview branch

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git
- SSH key for GitHub authentication (for automatic deployments)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/cfpg/port-au-next.git
cd port-au-next
```

2. Create a `.env` file with required variables, you can copy `.env.example` as a starter:

```bash
# Deployment Manager
DEPLOYMENT_MANAGER_HOST=domain.to.access.manager.com
DEPLOYMENT_MANAGER_AUTH_EMAIL=changeto@yourdomain.com
DEPLOYMENT_MANAGER_AUTH_PASSWORD=changeme098
BETTER_AUTH_SECRET=changeme567

# Shared Postgres DB superuser credentials
POSTGRES_USER=portaunext
POSTGRES_PASSWORD=changeme123
POSTGRES_DB=portaunext

# Image Optimization
IMGPROXY_HOST=cdn.yourdomain.com

# Minio Configuration
MINIO_HOST=storage.yourdomain.com
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# port-schedule (shared HTTP scheduler; see “HTTP scheduling” below)
PORT_SCHEDULE_MASTER_API_KEY=generate_a_long_random_secret
PORT_SCHEDULE_MIGRATE_ON_START=false
PORT_SCHEDULE_HOST_PORT=8085
# Optional: public hostname for nginx → port-schedule (see .env.example)
# PORT_SCHEDULE_HOST=schedule.yourdomain.com

# Optional: Used for cache busting
CLOUDFLARE_API_KEY=your_cloudflare_api_token
CLOUDFLARE_API_EMAIL=your_cloudflare_api_email
```

3. Launch the system:

```bash
docker compose up --build -d
```

4. Access the deployment manager UI at `http://localhost:80` or using the `DEPLOYMENT_MANAGER_HOST` you configured in the `.env` file and log in with the configured admin credentials

## Deployment Workflow

Port-Au-Next implements a blue/green deployment strategy:

1. **Preparation**: A new deployment is initiated via the UI or GitHub webhook
2. **Building**: The latest code is pulled and built into a new Docker image
3. **Launching**: A new container is started with the updated code and assigned a version
4. **Health Check**: The new container is verified as healthy
5. **Switching**: Nginx configuration is updated to route traffic to the new container
6. **Cleanup**: The previous container is gracefully terminated

This approach ensures your applications remain available throughout the entire deployment process.

## Preview Branches

Preview branches allow you to deploy and test feature branches in isolated environments before merging to production:

1. **Setup**: Enable preview branches for an application and configure a preview domain:
   - For example, use `preview.yourdomain.com` and setup a wildcard CNAME entry in your DNS server pointing to your server: `*.preview.yourdomain.com IN CNAME yourdomain.com`
2. **Deployment**: Deploy any branch to get an isolated environment with:
   - Unique subdomain (e.g., `feature-branch.preview.yourdomain.com`)
   - Isolated database
   - Global preview and branch-specific environment variables, allows you to point your preview environments to DEV services and use test new variables per branch
3. **Testing**: Test your changes in a production-like environment
4. **Cleanup**: Automatically or manually clean up preview environments when no longer needed

### Preview Branch Management

- Preview branches can be enabled/disabled per application
- Each preview deployment gets its own database and environment
- Environment variables can be set specifically for preview deployments
- Automatic cleanup options available for merged/deleted branches

## Configuration

### Adding a New Application

1. From the deployment manager UI, create a new application
2. Provide the Git repository URL and branch to deploy
3. Configure domain settings and environment variables
4. Initiate the first deployment

### Enabling Preview Branches

1. Navigate to your application's settings
2. Configure a preview domain (e.g., `*.preview.yourdomain.com`)
3. Enable the preview branches feature
4. Configure default preview environment variables (optional)

### User Management

1. Access the user management section from settings
2. Add new users with appropriate permissions
3. Manage user access and passwords
4. Configure authentication settings

### Custom Dockerfile

Port-Au-Next will use a repository's Dockerfile if present. Otherwise, it creates an optimized Dockerfile configured for Next.js applications with:

- Multi-stage build process
- Proper caching of dependencies
- Production-optimized settings
- Non-root user execution

### Environment Variables

Environment variables can be configured:

- Per application (base configuration)
- Per branch within an application (branch-specific overrides)
- Per preview deployment (preview-specific settings)

This flexibility enables managing multiple environments (development, staging, production) within the same Port-Au-Next instance.

## HTTP scheduling (port-schedule)

**port-schedule** is a first-party service that stores **per-app** cron-like jobs and, on a fixed interval, performs **outbound HTTP** requests to URLs you control (your Next.js app’s **public** routes). It uses the same PostgreSQL database as Port-Au-Next (`port_schedule` schema). There is no OS `crontab` inside app containers; scheduling is entirely API-driven.

### How apps get access

On each **production** deployment, the deployment manager:

1. Ensures a **tenant** row exists in `port_schedule.tenants` for your app (`apps.id`).
2. Stores the **plaintext client API key** in `app_services` (`service_type = port_schedule`), same idea as MinIO credentials.
3. Injects into the running app container:

| Variable | Purpose |
|----------|---------|
| `PORT_SCHEDULE_URL` | Base URL of the scheduler from inside Docker (fixed: `http://port-schedule:8080`). |
| `PORT_SCHEDULE_API_KEY` | **Secret** used as `Authorization: Bearer …` when **your app** calls the scheduler API. |

**Preview branch** deployments do not receive these variables in the current version; only the main production app deployment does.

**Never** expose `PORT_SCHEDULE_API_KEY` to the browser (do not prefix it with `NEXT_PUBLIC_`). Use it only in **server** code (Route Handlers, Server Actions, `instrumentation.ts`, scripts).

The deployment manager uses a separate **`PORT_SCHEDULE_MASTER_API_KEY`** (shared with the port-schedule container) only to call **admin** routes such as `PUT /admin/apps/:appId/credentials`. That master key is **not** injected into app containers.

### Tenant API (what your Next.js app calls)

All tenant routes are under **`/v1`** and require:

```http
Authorization: Bearer <PORT_SCHEDULE_API_KEY>
Content-Type: application/json
```

Examples:

- `GET /v1/jobs` — list **active** jobs (soft-deleted jobs are omitted).
- `POST /v1/jobs` — create a job (body includes `name`, `cron_expression`, `timezone`, `http_method`, `url`, optional `body`, `headers_json`, `webhook_secret`, `enabled`).
- `GET /v1/jobs/:jobId/runs` — paginated run history for a job.

Job names are **unique per app among non-deleted jobs**. Use a **stable `name`** (e.g. `nightly-sync`) so you can safely “ensure exists” on startup.

**Cron** uses a **six-field** expression (`second minute hour day month weekday`) with **10-second** granularity on the scheduler tick. Use an **IANA** timezone string (e.g. `America/Mexico_City`) per job.

**Webhook `url`** must satisfy the service’s **public URL policy** (typically `https://` to your real app hostname as seen from the internet—not `localhost`, Docker service names, or raw IPs). Use your public site URL and a dedicated path (e.g. `https://yourdomain.com/api/cron/nightly`).

When a job defines **`webhook_secret`**, every outbound request from port-schedule includes:

```http
X-PortAuNext-Schedule: <webhook_secret>
```

Your route should compare this value to a secret you also store in app env (see example below). This is **independent** of the Bearer API key used to talk **to** port-schedule.

### Next.js: ensure jobs once on server startup (`instrumentation.ts`)

Use root **`instrumentation.ts`** (or `src/instrumentation.ts`) and export **`register()`**. Run scheduler setup only in the **Node** runtime (not Edge). Depending on your Next.js version, you may need `experimental.instrumentationHook: true` in `next.config.js`—check the docs for your release.

Example pattern: list jobs, find by stable name, create if missing.

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const base = process.env.PORT_SCHEDULE_URL;
  const token = process.env.PORT_SCHEDULE_API_KEY;
  if (!base || !token) return;

  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  const webhookSecret = process.env.CRON_WEBHOOK_SECRET;
  if (!site || !webhookSecret) {
    console.warn('port-schedule: skip job ensure (NEXT_PUBLIC_SITE_URL or CRON_WEBHOOK_SECRET unset)');
    return;
  }

  const jobName = 'nightly-sync';
  const listRes = await fetch(`${base}/v1/jobs?limit=200`, { headers: auth });
  if (!listRes.ok) {
    console.error('port-schedule: list jobs failed', await listRes.text());
    return;
  }
  const { jobs } = (await listRes.json()) as { jobs: { name: string }[] };
  if (jobs.some((j) => j.name === jobName)) return;

  const body = {
    name: jobName,
    cron_expression: '0 0 2 * * *',
    timezone: 'UTC',
    http_method: 'POST',
    url: `${site}/api/cron/nightly`,
    webhook_secret: webhookSecret,
    enabled: true,
  };

  const createRes = await fetch(`${base}/v1/jobs`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  if (!createRes.ok) {
    console.error('port-schedule: create job failed', await createRes.text());
  }
}
```

Add **`CRON_WEBHOOK_SECRET`** to your app’s environment in the deployment manager (a long random string). It must match the `webhook_secret` you register on the job (here the same variable is passed in the `POST` body). In development, `register()` may run more than once (restarts/HMR); relying on a **unique job `name`** keeps the logic idempotent.

### Next.js: webhook Route Handler and verifying `X-PortAuNext-Schedule`

Implement a **public** POST route that port-schedule can call. Verify the header using a **timing-safe** compare so secrets are not leaked via short-circuiting.

```typescript
// app/api/cron/nightly/route.ts
import { timingSafeEqual } from 'crypto';

export async function POST(request: Request) {
  const expected = process.env.CRON_WEBHOOK_SECRET;
  const header = request.headers.get('x-portau-next-schedule') ?? '';
  if (!expected || header.length !== expected.length) {
    return new Response('Unauthorized', { status: 401 });
  }
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (!timingSafeEqual(a, b)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // … your scheduled work …
  return Response.json({ ok: true });
}
```

Use the **same** secret value in the job’s `webhook_secret` field and in `CRON_WEBHOOK_SECRET` for the app.

### Public nginx hostname (optional)

If you set **`PORT_SCHEDULE_HOST`** in the root `.env`, the deployment manager writes an nginx vhost so you can reach port-schedule via that hostname. App containers still use the fixed internal `PORT_SCHEDULE_URL` for API calls.

### Further detail

For the full contract (soft delete, undelete routes, admin API, URL policy), see the statement of work in `.plans/CUSTOM_HTTP_SCHEDULER_PLAN.md` in this repository (if present in your checkout).

## API Reference

Port-Au-Next exposes a REST API for programmatic control. Here are key endpoints:

### Applications
- `POST /api/:app/deploy`: Trigger a deployment for an application
- `GET /api/apps`: List all registered applications
- `GET /api/apps/:name/deployments`: List deployments for a specific application
- `GET /api/apps/:name/logs/:deploymentId`: Fetch logs for a specific deployment

### Preview Branches
- `POST /api/apps/:appId/preview-branches`: Enable preview branches for an app
- `POST /api/apps/:appId/preview-branches/:branch/deploy`: Deploy a preview branch
- `DELETE /api/apps/:appId/preview-branches/:branch`: Delete a preview branch
- `GET /api/apps/:appId/preview-branches`: List active preview branches

### Authentication
- `POST /api/auth/login`: Authenticate user and get session
- `POST /api/auth/logout`: End current session
- `POST /api/auth/password`: Change user password
- `GET /api/auth/session`: Get current session info

## Monitoring and Troubleshooting

The deployment manager provides:

- Deployment status tracking
- Container logs
- Health metrics
- Preview branch status monitoring
- Rollback capability for failed deployments

## Security Considerations

- All services run in an isolated Docker network
- SSH keys for repository access are mounted read-only
- Database credentials are managed securely
- Docker socket access is restricted to the deployment manager
- Secure session management for authenticated users
- Preview branch environments are fully isolated
- Environment variables are securely stored and managed
- Regular security updates available through Docker images

## License

Port-Au-Next is released under the MIT License. See [LICENSE](LICENSE) for details.

---

*Port-Au-Next: Deploy Next.js applications on your terms*
