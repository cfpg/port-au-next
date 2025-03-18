import pool from '~/services/database';

export interface App {
  id: number;
  name: string;
  domain: string;
  repo_url: string;
  branch: string;
  latest_status?: string;
  latest_deployment_date?: string;
  cloudflare_zone_id?: string;
  env: Record<string, string>;
}

export default async function fetchApps(): Promise<App[]> {
  try {
    // Get apps with their latest deployment status
    const result = await pool.query<App>(`
      SELECT a.*, 
             d.status as latest_status,
             d.deployed_at as latest_deployment_date,
             COALESCE(
               jsonb_object_agg(
                 env.key, 
                 env.value
               ) FILTER (WHERE env.key IS NOT NULL),
               '{}'::jsonb
             ) as env
      FROM apps a
      LEFT JOIN LATERAL (
        SELECT id, status, deployed_at
        FROM deployments
        WHERE app_id = a.id
        ORDER BY deployed_at DESC
        LIMIT 1
      ) d ON true
      LEFT JOIN app_env_vars env 
        ON env.app_id = a.id 
        AND env.branch = a.branch
      GROUP BY 
        a.id, 
        a.name, 
        a.domain, 
        a.repo_url, 
        a.branch,
        d.status,
        d.deployed_at
      ORDER BY a.created_at DESC
    `);

    return result.rows;
  } catch (error) {
    console.error('Error fetching apps:', error);
    throw new Error('Failed to fetch apps');
  }
}
