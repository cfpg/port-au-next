import pool from '~/services/database';
import { decryptSecret, encryptSecret } from '~/lib/encryption';

export async function fetchPlatformServiceSecret(
  serviceType: string
): Promise<string | null> {
  const result = await pool.query<{ secret_encrypted: string }>(
    `SELECT secret_encrypted
     FROM platform_service_secrets
     WHERE service_type = $1`,
    [serviceType]
  );

  const row = result.rows[0];
  if (!row?.secret_encrypted) {
    return null;
  }

  return decryptSecret(row.secret_encrypted);
}

export async function upsertPlatformServiceSecret(
  serviceType: string,
  plaintext: string
): Promise<void> {
  const secretEncrypted = encryptSecret(plaintext);
  await pool.query(
    `INSERT INTO platform_service_secrets (service_type, secret_encrypted)
     VALUES ($1, $2)
     ON CONFLICT (service_type)
     DO UPDATE SET
       secret_encrypted = EXCLUDED.secret_encrypted,
       updated_at = CURRENT_TIMESTAMP`,
    [serviceType, secretEncrypted]
  );
}
