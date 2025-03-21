import pool from '~/services/database';
import { App } from './fetchAppsQuery';

export default async function fetchSingleAppQuery(appName: string): Promise<App | null> {
  try {
    const result = await pool.query<App>(`
      SELECT 
        a.id,
        a.name,
        a.repo_url,
        a.branch,
        a.domain,
        a.db_name,
        a.db_user,
        a.db_password,
        a.cloudflare_zone_id,
        COALESCE(
          jsonb_object_agg(
            env.key, 
            env.value
          ) FILTER (WHERE env.key IS NOT NULL),
          '{}'::jsonb
        ) as env,
        COALESCE(d.status, 'stopped') as status,
        CASE 
          WHEN d.id IS NOT NULL THEN json_build_object(
            'version', d.version,
            'commit_id', d.commit_id,
            'status', d.status,
            'deployed_at', d.deployed_at
          )
          ELSE NULL
        END as last_deployment
      FROM apps a
      LEFT JOIN LATERAL (
        SELECT *
        FROM deployments d
        WHERE d.app_id = a.id
        ORDER BY d.deployed_at DESC
        LIMIT 1
      ) d ON true
      LEFT JOIN app_env_vars env 
        ON env.app_id = a.id 
        AND env.branch = a.branch
      WHERE a.name = $1
      GROUP BY 
        a.id,
        a.name, 
        a.repo_url, 
        a.branch,
        a.domain,
        a.db_name,
        a.db_user,
        a.db_password,
        a.cloudflare_zone_id,
        d.id,
        d.version,
        d.commit_id,
        d.status,
        d.deployed_at;
    `, [appName]);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching app:', error);
    throw new Error('Failed to fetch app');
  }
} 