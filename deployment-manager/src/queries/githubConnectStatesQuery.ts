import { createHash, randomBytes } from 'crypto';
import pool from '~/services/database';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function hashConnectStateToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mints a random, unpredictable single-use token for the "Connect GitHub" flow. Only its
 * hash is stored - the raw token exists solely in the redirect URL to GitHub and back.
 */
export async function createConnectState(appId: number, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashConnectStateToken(token);
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  await pool.query(
    `INSERT INTO github_connect_states (token_hash, app_id, user_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash, appId, userId, expiresAt]
  );

  return token;
}

export interface ConsumedConnectState {
  app_id: number;
  user_id: string;
}

/**
 * Atomically consumes a state token: a row is only returned if it exists, hasn't expired,
 * and hasn't already been used. A replayed token (used_at already set) or an expired one
 * both come back as null - the caller can't tell which, which is intentional (no need to
 * leak that distinction to whoever is driving the callback).
 */
export async function consumeConnectState(token: string): Promise<ConsumedConnectState | null> {
  const tokenHash = hashConnectStateToken(token);
  const result = await pool.query<ConsumedConnectState>(
    `UPDATE github_connect_states
     SET used_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING app_id, user_id`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}
