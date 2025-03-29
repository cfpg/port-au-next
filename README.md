# Port-Au-Next

![Port-Au-Next Logo](https://portaunext.cfpg.me/port-au-next-banner@2x.png)

**A no-downtime multi-tenant Next.js self-host deployment manager**

## Overview

Port-Au-Next is a robust, container-based deployment solution designed for self-hosting multiple Next.js applications with zero downtime. By leveraging blue/green deployment strategies, it ensures continuous availability of your applications during updates, without lock-in to proprietary cloud platforms.

Whether you're deploying to a VPS, cloud server, or hardware in your own environment, Port-Au-Next provides an elegant solution for managing your Next.js application fleet.

## Key Features

- **Blue/Green Deployments**: Seamless deployments with zero downtime using a true blue/green strategy
- **Multi-Tenancy**: Host multiple Next.js applications on a single server
- **Domain Management**: Connect multiple domains/subdomains to specific applications and branches
- **GitHub Actions Integration**: Automatically deploy when pushing to configured branches
- **Health Checks**: Intelligent service switching only when new deployments are verified healthy
- **Environment Isolation**: Each app or branch deployment can have its own environment variables
- **Customizable Build Process**: Use the default optimized Dockerfile or create your own
- **Shared Infrastructure**: PostgreSQL, Redis, and Thumbor services available to all applications
- **Web-Based Management UI**: Monitor and control your deployments through an intuitive interface

## Architecture

Port-Au-Next uses a Docker-based microservices architecture with the following components:

1. **Nginx Reverse Proxy**: Routes traffic to the correct application containers
2. **Deployment Manager**: Web UI and API for managing applications and deployments
3. **Shared Services**: PostgreSQL, Redis, and Thumbor available to all applications
4. **Application Containers**: Isolated containers for each application version

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

2. Create a `.env` file with required variables:

```bash
POSTGRES_USER=portaunext
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=portaunext
THUMBOR_SECURITY_KEY=your_secure_key
CLOUDFLARE_API_KEY=your_cloudflare_api_key
CLOUDFLARE_API_EMAIL=your_cloudflare_email
```

3. Launch the system:

```bash
docker compose up --build -d
```

4. Access the deployment manager UI at `http://localhost:80`

## Deployment Workflow

Port-Au-Next implements a blue/green deployment strategy:

1. **Preparation**: A new deployment is initiated via the UI or GitHub webhook
2. **Building**: The latest code is pulled and built into a new Docker image
3. **Launching**: A new container is started with the updated code and assigned a version
4. **Health Check**: The new container is verified as healthy
5. **Switching**: Nginx configuration is updated to route traffic to the new container
6. **Cleanup**: The previous container is gracefully terminated

This approach ensures your applications remain available throughout the entire deployment process.

## Configuration

### Adding a New Application

1. From the deployment manager UI, create a new application
2. Provide the Git repository URL and branch to deploy
3. Configure domain settings and environment variables
4. Initiate the first deployment

### Custom Dockerfile

Port-Au-Next will use a repository's Dockerfile if present. Otherwise, it creates an optimized Dockerfile configured for Next.js applications with:

- Multi-stage build process
- Proper caching of dependencies
- Production-optimized settings
- Non-root user execution

### Environment Variables

Environment variables can be configured:

- Globally for all applications
- Per application
- Per branch within an application

This flexibility enables managing multiple environments (development, staging, production) within the same Port-Au-Next instance.

### SSL Certificates

The project uses Let's Encrypt for SSL certificates. Before starting the services:

1. Create required directories:
   ```bash
   ./scripts/init-certbot.sh
   ```

2. Make sure your domain's DNS is properly configured:
   - Add an A record for `auth.yourdomain.com` pointing to your server's IP
   - Wait for DNS propagation (can take up to 24 hours)

3. Set the correct domain in your `.env` file:
   ```
   BETTER_AUTH_HOST=auth.yourdomain.com
   ```

4. Start the services:
   ```bash
   docker compose up -d
   ```

The certbot service will automatically:
- Generate SSL certificates for your domain
- Store them in `./nginx/ssl`
- Auto-renew them when needed

Note: The first time you run the services, certbot will attempt to verify domain ownership. Make sure:
- Your domain's DNS is properly configured
- Port 80 is accessible from the internet
- The domain matches your `BETTER_AUTH_HOST` setting

## API Reference

Port-Au-Next exposes a REST API for programmatic control. Here are key endpoints:

- `POST /:app/deploy`: Trigger a deployment for an application
- `GET /apps`: List all registered applications
- `GET /apps/:name/deployments`: List deployments for a specific application
- `GET /apps/:name/logs/:deploymentId`: Fetch logs for a specific deployment

## Monitoring and Troubleshooting

The deployment manager provides:

- Deployment status tracking
- Container logs
- Health metrics
- Rollback capability for failed deployments

## Security Considerations

- All services run in an isolated Docker network
- SSH keys for repository access are mounted read-only
- Database credentials are managed securely
- Docker socket access is restricted to the deployment manager


## License

Port-Au-Next is released under the MIT License. See [LICENSE](LICENSE) for details.

---

*Port-Au-Next: Deploy Next.js applications on your terms*
