import pool, { withTransaction } from '~/services/database';

export async function updateAppEnvVarsQuery(
  appId: number,
  branch: string | null,
  isPreview: boolean,
  vars: Record<string, string>
) {
  try {
    const appResult = await pool.query('SELECT id FROM apps WHERE id = $1', [appId]);
    if (appResult.rows.length === 0) {
      return { success: false, error: 'App not found' };
    }    
    
    const branchForRow = isPreview ? branch : null;
    await withTransaction(async (client) => {
      await client.query(
        'DELETE FROM app_env_vars WHERE app_id = $1 AND is_preview = $2',
        [appId, isPreview]
      );

      for (const [key, value] of Object.entries(vars)) {
        await client.query(
          `INSERT INTO app_env_vars (app_id, branch, key, value, is_preview)
           VALUES ($1, $2, $3, $4, $5)`,
          [appId, branchForRow, key, value, isPreview]
        );
      }
    });

    return { success: true };
  } catch (error) {
    console.error(
      `Error updating env vars: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return { success: false, error: 'Failed to update environment variables' };
  }
}
