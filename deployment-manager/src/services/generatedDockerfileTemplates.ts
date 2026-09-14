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

FROM builder AS source-map-publisher
ARG BUGSINK_SOURCEMAPS=false
ARG BUGSINK_URL
ARG BUGSINK_PROJECT_SLUG

RUN --mount=type=secret,id=bugsink_auth_token,required=false \\
  if [ "$BUGSINK_SOURCEMAPS" = "true" ]; then \\
    set -eu; \\
    test -s /run/secrets/bugsink_auth_token; \\
    test -n "$BUGSINK_URL"; \\
    test -n "$BUGSINK_PROJECT_SLUG"; \\
    find .next/static -type f -name '*.map' -print -quit | grep -q .; \\
    find .next/static -type f -name '*.map' -exec grep -q '"sourcesContent"' {} \\; -print -quit | grep -q .; \\
    npm install --global @sentry/cli@2.58.6; \\
    sentry-cli --version; \\
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/bugsink_auth_token)"; \\
    echo "Phase: source-maps — injecting browser debug IDs"; \\
    sentry-cli sourcemaps inject .next/static; \\
    grep -R -l 'debugId' .next/static | grep -q .; \\
    echo "Phase: source-maps — uploading browser artifacts"; \\
    sentry-cli --url "$BUGSINK_URL" sourcemaps \\
      --org bugsinkhasnoorgs \\
      --project "$BUGSINK_PROJECT_SLUG" \\
      upload .next/static; \\
    find .next/static -type f -name '*.map' -delete; \\
    echo "Phase: source-maps — upload complete; browser maps removed"; \\
  fi

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=source-map-publisher --chown=nextjs:nodejs /app/.next/static ./.next/static

ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12 CMD node -e "fetch('http://127.0.0.1:3000/', {redirect:'manual'}).then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"
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
# Skip postinstall (e.g. prisma generate) until the full repo exists in builder
RUN npm ci --ignore-scripts

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

RUN mkdir -p /migrate-artifacts && \\
  cp -r prisma /migrate-artifacts/ && \\
  cp package.json /migrate-artifacts/ && \\
  cp -r node_modules /migrate-artifacts/ && \\
  (cp prisma.config.ts /migrate-artifacts/ 2>/dev/null || true)

FROM base AS migrator
WORKDIR /app
COPY --from=builder /migrate-artifacts/ ./
ENV NODE_ENV=production

FROM builder AS source-map-publisher
ARG BUGSINK_SOURCEMAPS=false
ARG BUGSINK_URL
ARG BUGSINK_PROJECT_SLUG

RUN --mount=type=secret,id=bugsink_auth_token,required=false \\
  if [ "$BUGSINK_SOURCEMAPS" = "true" ]; then \\
    set -eu; \\
    test -s /run/secrets/bugsink_auth_token; \\
    test -n "$BUGSINK_URL"; \\
    test -n "$BUGSINK_PROJECT_SLUG"; \\
    find .next/static -type f -name '*.map' -print -quit | grep -q .; \\
    find .next/static -type f -name '*.map' -exec grep -q '"sourcesContent"' {} \\; -print -quit | grep -q .; \\
    npm install --global @sentry/cli@2.58.6; \\
    sentry-cli --version; \\
    export SENTRY_AUTH_TOKEN="$(cat /run/secrets/bugsink_auth_token)"; \\
    echo "Phase: source-maps — injecting browser debug IDs"; \\
    sentry-cli sourcemaps inject .next/static; \\
    grep -R -l 'debugId' .next/static | grep -q .; \\
    echo "Phase: source-maps — uploading browser artifacts"; \\
    sentry-cli --url "$BUGSINK_URL" sourcemaps \\
      --org bugsinkhasnoorgs \\
      --project "$BUGSINK_PROJECT_SLUG" \\
      upload .next/static; \\
    find .next/static -type f -name '*.map' -delete; \\
    echo "Phase: source-maps — upload complete; browser maps removed"; \\
  fi

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=source-map-publisher --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /prisma-runtime-stage/ ./

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12 CMD node -e "fetch('http://127.0.0.1:3000/', {redirect:'manual'}).then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"
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
