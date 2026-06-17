import pool from '~/services/database';

export interface CloudflareConfigRow {
  id: number;
  account_id: string;
  api_token_encrypted: string;
  tunnel_id: string | null;
  tunnel_name: string | null;
  tunnel_origin_url: string;
  connected_at: Date;
  updated_at: Date;
}

export async function fetchCloudflareConfig(): Promise<CloudflareConfigRow | null> {
  const result = await pool.query<CloudflareConfigRow>(
    `SELECT id, account_id, api_token_encrypted, tunnel_id, tunnel_name,
            tunnel_origin_url, connected_at, updated_at
     FROM cloudflare_config
     ORDER BY id ASC
     LIMIT 1`
  );
  return result.rows[0] ?? null;
}

export async function upsertCloudflareConfig(input: {
  accountId: string;
  apiTokenEncrypted: string;
  tunnelOriginUrl?: string;
}): Promise<CloudflareConfigRow> {
  const existing = await fetchCloudflareConfig();
  if (existing) {
    const result = await pool.query<CloudflareConfigRow>(
      `UPDATE cloudflare_config
       SET account_id = $1,
           api_token_encrypted = $2,
           tunnel_origin_url = COALESCE($3, tunnel_origin_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, account_id, api_token_encrypted, tunnel_id, tunnel_name,
                 tunnel_origin_url, connected_at, updated_at`,
      [
        input.accountId,
        input.apiTokenEncrypted,
        input.tunnelOriginUrl ?? null,
        existing.id,
      ]
    );
    return result.rows[0];
  }

  const result = await pool.query<CloudflareConfigRow>(
    `INSERT INTO cloudflare_config (account_id, api_token_encrypted, tunnel_origin_url)
     VALUES ($1, $2, $3)
     RETURNING id, account_id, api_token_encrypted, tunnel_id, tunnel_name,
               tunnel_origin_url, connected_at, updated_at`,
    [
      input.accountId,
      input.apiTokenEncrypted,
      input.tunnelOriginUrl ?? 'http://localhost',
    ]
  );
  return result.rows[0];
}

export async function updateSelectedTunnel(input: {
  tunnelId: string;
  tunnelName: string;
}): Promise<void> {
  await pool.query(
    `UPDATE cloudflare_config
     SET tunnel_id = $1, tunnel_name = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = (SELECT id FROM cloudflare_config ORDER BY id ASC LIMIT 1)`,
    [input.tunnelId, input.tunnelName]
  );
}

export async function updateTunnelOriginUrl(originUrl: string): Promise<void> {
  await pool.query(
    `UPDATE cloudflare_config
     SET tunnel_origin_url = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = (SELECT id FROM cloudflare_config ORDER BY id ASC LIMIT 1)`,
    [originUrl]
  );
}

export async function deleteCloudflareConfig(): Promise<void> {
  await pool.query('DELETE FROM cloudflare_config');
  await pool.query('DELETE FROM cloudflare_hostname_routes');
}
