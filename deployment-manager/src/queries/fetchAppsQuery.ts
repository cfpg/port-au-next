import pool from '~/services/database';
import { App } from '~/types';
import { deriveAppStatus, deriveActivityAt, sortAppsByActivity } from '~/utils/appStatus';

interface AppRow extends Omit<App, 'status' | 'activity_at'> {
  deployment_status: string | null;
  deployment_deployed_at: string | null;
  /** FIFO-head outstanding (queued/running only - never 'failed') request, if any. */
  next_queue_status: 'queued' | 'running' | null;
  /** Most recent unlinked request regardless of status - for activity/ordering only. */
  latest_queue_created_at: string | null;
}

export default async function fetchAppsQuery({ where: { appId, appName } = {} }: { where?: { appId?: number, appName?: string } } = {}): Promise<App[]> {
  try {
    const where: { appId?: number, appName?: string } = {}
    if (appId) where.appId = appId;
    if (appName) where.appName = appName;

    // Get apps with their latest deployment status, environment variables, and two
    // separate signals from deploy_queue_jobs on the app's OWN branch (production only,
    // matching the `d` join's own branch scoping, so a queued preview-branch request
    // never affects this):
    //   - next_queue_status: the FIFO-head OUTSTANDING (queued/running) request, if any -
    //     'failed' is deliberately excluded here, since a job that failed before ever
    //     producing a deployment row is not outstanding work and must not make the app
    //     look queued forever (it stays visible in Deployment History instead).
    //   - latest_queue_created_at: the most recent unlinked request regardless of status
    //     (queued, running, OR failed) - for activity/ordering only, so re-queuing an app
    //     that already had an older outstanding request still bumps its recency, without
    //     changing which request actually runs next (that stays strict FIFO by id).
    // The actual status precedence (in-progress deployment wins, else next_queue_status,
    // else last deployment's status) is computed in JS via deriveAppStatus - one shared
    // place instead of duplicating that logic in SQL.
    const result = await pool.query<AppRow>(`
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
        a.root_path,
        COALESCE(
          jsonb_object_agg(
            env.key,
            env.value
          ) FILTER (WHERE env.key IS NOT NULL),
          '{}'::jsonb
        ) as env,
        d.status as deployment_status,
        CASE
          WHEN d.id IS NOT NULL THEN json_build_object(
            'version', d.version,
            'commit_id', d.commit_id,
            'status', d.status,
            'deployed_at', d.deployed_at
          )
          ELSE NULL
        END as last_deployment,
        d.deployed_at as deployment_deployed_at,
        next_qj.status as next_queue_status,
        latest_qj.created_at as latest_queue_created_at
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
      LEFT JOIN LATERAL (
        SELECT status
        FROM deploy_queue_jobs dqj
        WHERE dqj.app_id = a.id
        AND dqj.branch = a.branch
        AND dqj.deployment_id IS NULL
        AND dqj.status IN ('queued', 'running')
        ORDER BY dqj.id ASC
        LIMIT 1
      ) next_qj ON true
      LEFT JOIN LATERAL (
        SELECT created_at
        FROM deploy_queue_jobs dqj
        WHERE dqj.app_id = a.id
        AND dqj.branch = a.branch
        AND dqj.deployment_id IS NULL
        ORDER BY dqj.id DESC
        LIMIT 1
      ) latest_qj ON true
      LEFT JOIN app_env_vars env
        ON env.app_id = a.id
        AND env.is_preview = false
        AND env.branch IS NULL
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
        a.root_path,
        d.id,
        d.version,
        d.commit_id,
        d.status,
        d.deployed_at,
        next_qj.status,
        latest_qj.created_at;
    `);

    const apps: App[] = result.rows.map((row) => {
      const { deployment_status, deployment_deployed_at, next_queue_status, latest_queue_created_at, ...appFields } = row;
      return {
        ...appFields,
        status: deriveAppStatus(deployment_status, next_queue_status),
        activity_at: deriveActivityAt(deployment_deployed_at, latest_queue_created_at),
      };
    });

    // Ordering moved to JS alongside the status derivation above, since it now depends on
    // the same queue-aware `activity_at` rather than a plain SQL ORDER BY on deployed_at.
    return sortAppsByActivity(apps);
  } catch (error) {
    console.error('Error fetching apps:', error);
    throw new Error('Failed to fetch apps');
  }
}
