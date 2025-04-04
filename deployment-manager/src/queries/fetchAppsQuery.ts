import pool from '~/services/database';
import { App } from '~/types';

export default async function fetchAppsQuery({ where: { appId, appName } = {} }: { where?: { appId?: number, appName?: string } } = {}): Promise<App[]> {
  try {
    const where: { appId?: number, appName?: string } = {}
    if (appId) where.appId = appId;
    if (appName) where.appName = appName;

    // Get apps with their latest deployment status and environment variables
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
      ${Object.keys(where).length > 0 ? `WHERE ${Object.entries(where).map(([key, value]) => `${key} = ${value}`).join(' AND ')}` : ''}
      LEFT JOIN LATERAL (
        SELECT *
        FROM deployments d
        WHERE d.app_id = a.id
        AND (d.is_preview = false OR d.is_preview IS NULL)
        AND (d.branch = a.branch OR d.branch IS NULL)
        ORDER BY d.deployed_at DESC
        LIMIT 1
      ) d ON true
      LEFT JOIN app_env_vars env 
        ON env.app_id = a.id 
        AND env.branch = a.branch
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
        d.deployed_at
      ORDER BY d.deployed_at DESC NULLS LAST, a.name;
    `);

    return result.rows;
  } catch (error) {
    console.error('Error fetching apps:', error);
    throw new Error('Failed to fetch apps');
  }
}
