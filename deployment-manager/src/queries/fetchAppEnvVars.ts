import pool from "~/services/database";

export interface AppEnvVar {
  key: string;
  value: string;
  branch: string | null;
  is_preview: boolean;
}

/** Production rows are project-scoped (branch NULL); preview rows may be shared or branch-specific. */
export default async function fetchAppEnvVars(appId: number, isPreview: boolean = false): Promise<AppEnvVar[]> {
  try {
    const result = await pool.query<AppEnvVar>(`
      SELECT key, value, branch, is_preview
      FROM app_env_vars
      WHERE app_id = $1
      AND is_preview = $2
      AND ($2 = true OR branch IS NULL)
      ORDER BY key ASC
    `, [appId, isPreview]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching app environment variables:', error);
    throw new Error('Failed to fetch app environment variables');
  }
}
