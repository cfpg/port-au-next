import pool from '~/services/database';
import { App } from '~/types';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import { getMinioEnvVars } from '~/services/minio';
import { ensurePortScheduleForProductionApp } from '~/services/portSchedule';
import { getUmamiEnvVarsForProductionApp } from '~/services/umami';

interface EnvVar {
  key: string;
  value: string;
}

/**
 * Fetches user-defined env vars from the DB and merges platform-injected vars
 * (Minio, Imgproxy, port-schedule, Umami, site URL). Platform keys listed later win over
 * duplicate keys from the DB.
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
     AND (av.branch = $3 OR av.branch IS NULL)`,
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
    productionOnlyEnvVars = [
      ...Object.entries(scheduleVars).map(([key, value]) => ({ key, value })),
      ...Object.entries(umamiVars).map(([key, value]) => ({ key, value })),
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
