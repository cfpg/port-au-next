function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export function loadDbConfig() {
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = parseInt(process.env.POSTGRES_PORT ?? '5432', 10);
  const user = requireEnv('POSTGRES_USER');
  const password = requireEnv('POSTGRES_PASSWORD');
  const database = requireEnv('POSTGRES_DB');

  const connectionString =
    process.env.DATABASE_URL ??
    `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;

  return { connectionString };
}

export function loadAppConfig() {
  return {
    ...loadDbConfig(),
    port: parseInt(process.env.PORT ?? '8080', 10),
    masterApiKey: requireEnv('MASTER_API_KEY'),
    /** When true, applies SQL migrations on process start (idempotent). Default false so DB is untouched until you opt in. */
    migrateOnStart: process.env.MIGRATE_ON_START === 'true',
  };
}
