import pool from '~/services/database';

export interface GithubAppConfigRow {
  id: number;
  app_slug: string;
  app_id: string;
  client_id: string | null;
  private_key_encrypted: string;
  webhook_secret_encrypted: string;
  connected_at: Date;
  updated_at: Date;
}

export async function fetchGithubAppConfig(): Promise<GithubAppConfigRow | null> {
  const result = await pool.query<GithubAppConfigRow>(
    `SELECT id, app_slug, app_id, client_id, private_key_encrypted, webhook_secret_encrypted,
            connected_at, updated_at
     FROM github_app_config
     ORDER BY id ASC
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}

export async function upsertGithubAppConfig(input: {
  appSlug: string;
  appId: string;
  clientId?: string | null;
  privateKeyEncrypted: string;
  webhookSecretEncrypted: string;
}): Promise<GithubAppConfigRow> {
  const existing = await fetchGithubAppConfig();
  if (existing) {
    const result = await pool.query<GithubAppConfigRow>(
      `UPDATE github_app_config
       SET app_slug = $1,
           app_id = $2,
           client_id = $3,
           private_key_encrypted = $4,
           webhook_secret_encrypted = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, app_slug, app_id, client_id, private_key_encrypted, webhook_secret_encrypted,
                 connected_at, updated_at`,
      [
        input.appSlug,
        input.appId,
        input.clientId ?? null,
        input.privateKeyEncrypted,
        input.webhookSecretEncrypted,
        existing.id,
      ]
    );
    return result.rows[0];
  }

  const result = await pool.query<GithubAppConfigRow>(
    `INSERT INTO github_app_config (app_slug, app_id, client_id, private_key_encrypted, webhook_secret_encrypted)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, app_slug, app_id, client_id, private_key_encrypted, webhook_secret_encrypted,
               connected_at, updated_at`,
    [
      input.appSlug,
      input.appId,
      input.clientId ?? null,
      input.privateKeyEncrypted,
      input.webhookSecretEncrypted,
    ]
  );
  return result.rows[0];
}

export async function deleteGithubAppConfig(): Promise<void> {
  await pool.query('DELETE FROM github_app_config');
}
