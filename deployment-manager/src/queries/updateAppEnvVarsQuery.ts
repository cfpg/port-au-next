import pool from '~/services/database';

export async function updateAppEnvVarsQuery(appId: number, branch: string, vars: Record<string, string>) {
  try {
    // Verify appId and branch are valid
    const appResult = await pool.query('SELECT id FROM apps WHERE id = $1 AND branch = $2', [appId, branch]);
    if (appResult.rows.length === 0) {
      return { success: false, error: 'App not found' };
    }    
    
    await pool.query('BEGIN');

    // Fetch all existing env vars for the app
    const existingVars = await pool.query('SELECT * FROM app_env_vars WHERE app_id = $1', [appId]);
    
    // Find vars that should be removed
    const varsToRemove = existingVars.rows.filter((row) => !Object.keys(vars).includes(row.key));
    
    // Insert new env vars
    for (const [key, value] of Object.entries(vars)) {
      await pool.query(`
        INSERT INTO app_env_vars (app_id, branch, key, value)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (app_id, branch, key)
        DO UPDATE SET value = EXCLUDED.value
      `, [appId, branch, key, value]);
    }

    // Remove vars that should be removed
    for (const row of varsToRemove) {
      await pool.query('DELETE FROM app_env_vars WHERE app_id = $1 AND branch = $2 AND key = $3', [appId, branch, row.key]);
    }
    
    await pool.query('COMMIT');
    return { success: true };
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error(`Error updating env vars: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, error: 'Failed to update environment variables' };
  }
} 