# syntax=docker.io/docker/dockerfile:1

FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install system dependencies
RUN apk add --no-cache libc6-compat docker-cli git openssh-client

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./

# Install regular dependencies
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create Cloudflare credentials file for certbot
RUN mkdir -p /etc/letsencrypt && \
    echo "dns_cloudflare_email = ${CLOUDFLARE_API_EMAIL}" > /etc/letsencrypt/cloudflare.ini && \
    echo "dns_cloudflare_api_key = ${CLOUDFLARE_API_KEY}" >> /etc/letsencrypt/cloudflare.ini && \
    chmod 600 /etc/letsencrypt/cloudflare.ini

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js app
RUN npm run build -- -d

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install production dependencies
RUN apk add --no-cache \
    docker-cli \
    docker-compose \
    git \
    openssh-client \
    shadow

# Create docker group with GID 1001 and add node user to it
RUN addgroup -g 1001 docker && \
    addgroup node docker

# Set up SSH directory and add GitHub's host key
RUN mkdir -p /home/node/.ssh && \
    chown -R node:node /home/node/.ssh && \
    ssh-keyscan github.com > /home/node/.ssh/known_hosts && \
    chown node:node /home/node/.ssh/known_hosts && \
    chmod 644 /home/node/.ssh/known_hosts

# Copy only the compiled app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /etc/letsencrypt/cloudflare.ini /etc/letsencrypt/cloudflare.ini

# Switch to node user
USER node

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run the Next.js server
CMD ["node", "server.js"] 