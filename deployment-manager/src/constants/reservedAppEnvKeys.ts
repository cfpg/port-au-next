/**
 * Keys injected by Port-Au-Next at deploy/runtime. Do not store these in app_env_vars.
 */
export const RESERVED_APP_ENV_KEYS = new Set([
  'BRANCH',
  'DATABASE_URL',
  'HOSTNAME',
  'IMGPROXY_HOST',
  'MINIO_ACCESS_KEY',
  'MINIO_BUCKET',
  'MINIO_HOST',
  'MINIO_SECRET_KEY',
  'NEXT_PUBLIC_IMGPROXY_HOST',
  'NEXT_PUBLIC_SITE_URL',
  'NODE_ENV',
  'PORT',
  'PORT_SCHEDULE_API_KEY',
  'PORT_SCHEDULE_URL',
  'POSTGRES_DB',
  'POSTGRES_HOST',
  'POSTGRES_PASSWORD',
  'POSTGRES_USER',
]);

export function isReservedAppEnvKey(key: string): boolean {
  return RESERVED_APP_ENV_KEYS.has(key);
}
