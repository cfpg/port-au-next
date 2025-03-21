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

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Compile migration script
RUN npx tsc src/scripts/migrate.ts --outDir dist/scripts --esModuleInterop

# Build Next.js app
RUN npm run build -- -d

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install production dependencies
RUN apk add --no-cache docker-cli git openssh-client

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set up SSH directory for the nextjs user
RUN mkdir -p /home/nextjs/.ssh && chown -R nextjs:nodejs /home/nextjs/.ssh

# Copy public directory and standalone build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy compiled migration script
COPY --from=builder /app/dist/scripts/migrate.js ./scripts/

# Switch to non-root user
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migration before starting the server
CMD ["sh", "-c", "node scripts/migrate.js && node server.js"] 