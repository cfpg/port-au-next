import pool from '~/services/database';
import { isReservedAppEnvKey } from '~/constants/reservedAppEnvKeys';

export type ImportSkipReason = 'reserved' | 'exists' | 'invalid_key';

export type ImportAppEnvVarsResult = {
  success: boolean;
  inserted: string[];
  skipped: Array<{ key: string; reason: ImportSkipReason }>;
  error?: string;
};

export async function importAppEnvVarsQuery(
  appId: number,
  branch: string | null,
  vars: Record<string, string>
): Promise<ImportAppEnvVarsResult> {
  const appResult = await pool.query('SELECT id, branch FROM apps WHERE id = $1', [appId]);
  if (appResult.rows.length === 0) {
    return { success: false, inserted: [], skipped: [], error: 'App not found' };
  }

  const appBranch: string = appResult.rows[0].branch;
  const isPreview = branch === null || branch !== appBranch;
  const branchForRow = isPreview ? null : branch ?? appBranch;

  const existing = await pool.query<{ key: string }>(
    `SELECT key FROM app_env_vars WHERE app_id = $1 AND is_preview = $2`,
    [appId, isPreview]
  );
  const existingKeys = new Set(existing.rows.map((row) => row.key));

  const inserted: string[] = [];
  const skipped: Array<{ key: string; reason: ImportSkipReason }> = [];

  try {
    await pool.query('BEGIN');

    for (const [key, value] of Object.entries(vars)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        skipped.push({ key, reason: 'invalid_key' });
        continue;
      }
      if (isReservedAppEnvKey(key)) {
        skipped.push({ key, reason: 'reserved' });
        continue;
      }
      if (existingKeys.has(key)) {
        skipped.push({ key, reason: 'exists' });
        continue;
      }

      await pool.query(
        `INSERT INTO app_env_vars (app_id, branch, key, value, is_preview)
         VALUES ($1, $2, $3, $4, $5)`,
        [appId, branchForRow, key, value, isPreview]
      );
      existingKeys.add(key);
      inserted.push(key);
    }

    await pool.query('COMMIT');
    return { success: true, inserted, skipped };
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error importing env vars:', error);
    return {
      success: false,
      inserted: [],
      skipped: [],
      error: 'Failed to import environment variables',
    };
  }
}
