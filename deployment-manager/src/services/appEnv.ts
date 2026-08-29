import pool from '~/services/database';
import { App } from '~/types';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import { getMinioEnvVars } from '~/services/minio';
import { ensurePortScheduleForProductionApp } from '~/services/portSchedule';
import { getUmamiEnvVarsForProductionApp } from '~/services/umami';
import { getBugsinkEnvVarsForProductionApp } from '~/services/bugsink';
import { getTestDatabaseEnvVarsForProductionApp } from '~/services/testDatabase';

interface EnvVar {
  key: string;
  value: string;
}

/**
 * Fetches user-defined env vars from the DB and merges platform-injected vars
 * (Minio, Imgproxy, port-schedule, Umami, Bugsink, test database, site URL). Platform keys listed
 * later win over duplicate keys from the DB.
 */
export async function getPlatformAppEnvVars(
  app: App,
  branch: string = 'main',
  options: { isPreview?: boolean } = {}
): Promise<EnvVar[]> {
  const isPreview = options.isPreview ?? branch !== app.branch;

  const envResult = await pool.query(
    `SELECT key, value 
     FROM app_env_vars av
     JOIN apps a ON a.id = av.app_id
     WHERE a.id = $1
     AND av.is_preview = $2
     AND (
       ($2 = false AND av.branch IS NULL)
       OR ($2 = true AND (av.branch = $3 OR av.branch IS NULL))
     )`,
    [app.id, isPreview, branch]
  );
  const envVars = envResult.rows;

  const isProduction = !isPreview;
  const minioCredentials = await fetchAppServiceCredentialsQuery(app.id, 'minio', !isProduction);

  let minioEnvVars: Record<string, string> = {};
  if (minioCredentials.length) {
    minioEnvVars = getMinioEnvVars(minioCredentials[0], app.name);
  }

  const minioEnvVarsArray = Object.entries(minioEnvVars).map(([key, value]) => ({
    key,
    value,
  }));

  let productionOnlyEnvVars: EnvVar[] = [];
  if (isProduction) {
    const scheduleVars = await ensurePortScheduleForProductionApp(app);
    const umamiVars = await getUmamiEnvVarsForProductionApp(app);
    const bugsinkVars = await getBugsinkEnvVarsForProductionApp(app);
    const testDatabaseVars = await getTestDatabaseEnvVarsForProductionApp(app);
    productionOnlyEnvVars = [
      ...Object.entries(scheduleVars).map(([key, value]) => ({ key, value })),
      ...Object.entries(umamiVars).map(([key, value]) => ({ key, value })),
      ...Object.entries(bugsinkVars).map(([key, value]) => ({ key, value })),
      ...Object.entries(testDatabaseVars).map(([key, value]) => ({ key, value })),
    ];
  }

  return [
    { key: 'IMGPROXY_HOST', value: process.env.IMGPROXY_HOST || '' },
    { key: 'NEXT_PUBLIC_IMGPROXY_HOST', value: process.env.IMGPROXY_HOST || '' },
    { key: 'NEXT_PUBLIC_SITE_URL', value: `https://${app.domain}` },
    ...envVars,
    ...minioEnvVarsArray,
    ...productionOnlyEnvVars,
  ];
}

/**
 * Builds the full runtime/build env for an app: user vars from the DB plus all
 * platform-injected reserved keys. Caller-supplied infrastructure vars (Postgres,
 * DATABASE_URL, BRANCH) always win last.
 */
export async function mergeAppEnv(
  app: App,
  branch: string,
  infrastructure: Record<string, string> = {},
  options: { isPreview?: boolean } = {}
): Promise<Record<string, string>> {
  const platformRows = await getPlatformAppEnvVars(app, branch, options);
  const platform = Object.fromEntries(platformRows.map(({ key, value }) => [key, value]));
  return { ...platform, ...infrastructure };
}

/**
 * Reproduces the Postgres/infrastructure block injected into an app's production
 * container at deploy time (see services/docker.ts). If the app has no database
 * credentials yet, only BRANCH is returned.
 */
export function buildProductionInfrastructureEnv(app: App): Record<string, string> {
  if (!app.db_user || !app.db_password || !app.db_name) {
    return { BRANCH: app.branch };
  }

  return {
    POSTGRES_USER: app.db_user,
    POSTGRES_PASSWORD: app.db_password,
    POSTGRES_DB: app.db_name,
    POSTGRES_HOST: 'postgres',
    BRANCH: app.branch,
    DATABASE_URL: `postgres://${app.db_user}:${app.db_password}@postgres:5432/${app.db_name}`,
  };
}

/**
 * Builds the full effective production env for an app, identical to what is
 * written into the container's .env at deploy time.
 */
export async function getDeployedProductionEnv(app: App): Promise<Record<string, string>> {
  const infrastructure = buildProductionInfrastructureEnv(app);
  return mergeAppEnv(app, app.branch, infrastructure, { isPreview: false });
}

/**
 * Where the exported env should point Postgres at:
 * - `postgres`: the compose service hostname (as deployed).
 * - `localhost`: the host machine (works when Postgres is reachable on localhost).
 * - `host.docker.internal`: the host machine from inside WSL/Docker Desktop.
 */
export type ExportPostgresHost = 'postgres' | 'localhost' | 'host.docker.internal';

const DB_BLOCK_ORDER = [
  'POSTGRES_HOST',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'TEST_POSTGRES_HOST',
  'TEST_POSTGRES_USER',
  'TEST_POSTGRES_PASSWORD',
  'TEST_POSTGRES_DB',
];

/**
 * Rewrites the Postgres connection target for the chosen export host and converts
 * DATABASE_URL into the interpolated form (`${POSTGRES_USER}` etc.) so the host can
 * be changed by editing a single variable.
 */
export function applyExportPostgresHost(
  env: Record<string, string>,
  host: ExportPostgresHost
): Record<string, string> {
  const next = { ...env };

  if (next.POSTGRES_HOST) {
    next.POSTGRES_HOST = host;
  }
  if (next.TEST_POSTGRES_HOST) {
    next.TEST_POSTGRES_HOST = host;
  }

  const hasDbCredentials =
    next.POSTGRES_USER && next.POSTGRES_PASSWORD && next.POSTGRES_DB;

  if (next.DATABASE_URL && hasDbCredentials) {
    const scheme = next.DATABASE_URL.split('://')[0] || 'postgres';
    const portMatch = next.DATABASE_URL.match(/@[^:/]+:(\d+)(?:\/|$)/);
    const port = portMatch ? portMatch[1] : '5432';
    next.DATABASE_URL =
      `${scheme}://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}` +
      `@\${POSTGRES_HOST}:${port}/\${POSTGRES_DB}`;
  }

  const hasTestDbCredentials =
    next.TEST_POSTGRES_USER && next.TEST_POSTGRES_PASSWORD && next.TEST_POSTGRES_DB;
  if (next.TEST_DATABASE_URL && hasTestDbCredentials) {
    const scheme = next.TEST_DATABASE_URL.split('://')[0] || 'postgres';
    const portMatch = next.TEST_DATABASE_URL.match(/@[^:/]+:(\d+)(?:\/|$)/);
    const port = portMatch ? portMatch[1] : '5432';
    next.TEST_DATABASE_URL =
      `${scheme}://\${TEST_POSTGRES_USER}:\${TEST_POSTGRES_PASSWORD}` +
      `@\${TEST_POSTGRES_HOST}:${port}/\${TEST_POSTGRES_DB}`;
  }

  return next;
}

/**
 * Serializes an env map into `.env` file text. The Postgres block is emitted first
 * in a fixed order (so DATABASE_URL's `${...}` references resolve), followed by the
 * remaining keys sorted alphabetically. All values are double-quoted.
 */
export function formatEnvAsDotEnv(env: Record<string, string>): string {
  const dbKeys = DB_BLOCK_ORDER.filter((key) => key in env);
  const urlKeys = ['DATABASE_URL', 'TEST_DATABASE_URL'].filter((key) => key in env);
  const grouped = new Set([...dbKeys, ...urlKeys]);

  const restKeys = Object.keys(env)
    .filter((key) => !grouped.has(key))
    .sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];

  for (const key of dbKeys) {
    lines.push(`${key}=${quoteLiteralValue(env[key] ?? '')}`);
  }
  for (const key of urlKeys) {
    lines.push(`${key}=${quoteInterpolatedValue(env[key] ?? '')}`);
  }
  if (grouped.size > 0 && restKeys.length > 0) {
    lines.push('');
  }

  for (const key of restKeys) {
    lines.push(`${key}=${quoteLiteralValue(env[key] ?? '')}`);
  }

  return lines.join('\n');
}

/** Double-quotes a literal value, escaping `$` so it is never interpolated. */
function quoteLiteralValue(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return `"${escaped}"`;
}

/** Double-quotes a value while preserving `${...}` references for interpolation. */
function quoteInterpolatedValue(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return `"${escaped}"`;
}
