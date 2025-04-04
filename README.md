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
- **Shared Infrastructure**: PostgreSQL, Redis, and Thumbor services available to all applications
- **Web-Based Management UI**: Monitor and control your deployments through an intuitive interface

## Architecture

Port-Au-Next uses a Docker-based microservices architecture with the following components:

1. **Nginx Reverse Proxy**: Routes traffic to the correct application containers and preview branch deployments
2. **Deployment Manager**: Web UI and API for managing applications and deployments, with secure authentication
3. **Authentication Layer**: Handles user authentication and session management
4. **Preview Branch Manager**: Manages isolated preview environments for feature branches
5. **Shared Services**: PostgreSQL, Redis, and Thumbor available to all applications
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
# Database Configuration
POSTGRES_USER=portaunext
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=portaunext

# Services Configuration
THUMBOR_SECURITY_KEY=your_secure_key

# Authentication Configuration
DEPLOYMENT_MANAGER_AUTH_EMAIL=admin@example.com
DEPLOYMENT_MANAGER_AUTH_PASSWORD=your_secure_admin_password
DEPLOYMENT_MANAGER_HOST=mgmt.example.com # Should be pointed to your server, used to access the deployment-manager web UI

# Cloudflare Integration (optional)
CLOUDFLARE_API_KEY=your_cloudflare_api_key
CLOUDFLARE_API_EMAIL=your_cloudflare_email
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
