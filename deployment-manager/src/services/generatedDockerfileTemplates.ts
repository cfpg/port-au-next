export function buildNextDockerfile(markerLine: string): string {
  return `# syntax=docker/dockerfile:1
${markerLine}

FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
`;
}

export function buildPrismaDockerfile(markerLine: string): string {
  return `# syntax=docker/dockerfile:1
${markerLine}

FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

RUN test -f prisma/schema.prisma || (echo "ERROR: prisma/schema.prisma not found (check .dockerignore and repo layout)." && exit 1)

RUN npx prisma generate
RUN npm run build

RUN set -e; \\
  stage=/prisma-runtime-stage; rm -rf "$stage"; mkdir -p "$stage"; \\
  found=0; \\
  for p in generated src/generated node_modules/.prisma; do \\
    if [ -d "$p" ] && [ -n "$(ls -A "$p" 2>/dev/null)" ]; then \\
      mkdir -p "$stage/$(dirname "$p")"; \\
      cp -a "$p" "$stage/$p"; \\
      found=1; \\
    fi; \\
  done; \\
  if [ "$found" -eq 0 ]; then \\
    echo "ERROR: Prisma client missing after generate — expected output under generated/, src/generated/, or node_modules/.prisma."; \\
    exit 1; \\
  fi; \\
  if [ -f prisma.config.ts ]; then cp prisma.config.ts "$stage/"; fi

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /prisma-runtime-stage/ ./

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
`;
}

export function buildGeneratedDockerfileContent(
  usesPrisma: boolean,
  markerLine: string
): string {
  return usesPrisma
    ? buildPrismaDockerfile(markerLine)
    : buildNextDockerfile(markerLine);
}
