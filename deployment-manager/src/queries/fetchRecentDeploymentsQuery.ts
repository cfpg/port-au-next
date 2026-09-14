import pool from '~/services/database';
import { Deployment } from '~/types';
import { mapDeploymentHistoryRow, DeploymentHistoryRow } from '~/utils/deploymentHistoryRows';

/**
 * Deployments plus not-yet-linked deploy_queue_jobs requests (queued, claimed-but-not-
 * linked, or failed before a deployment row ever existed), as ONE SQL statement.
 *
 * This has to be a single statement, not "read deployments, then separately read queue
 * jobs": the worker links a job to its new `deployments` row in one transaction (see
 * deployQueue.ts's runJob), so two sequential reads race that transaction - if it commits
 * between them, the request is in neither result and disappears from the list until the
 * next poll. One statement sees one consistent snapshot, so the request is represented
 * exactly once (via `deployments` once linked, via the queue placeholder until then) no
 * matter when the linking transaction lands relative to this query.
 *
 * Pagination (LIMIT/OFFSET) is applied to the combined, ordered result here in SQL, not by
 * merging two already-paginated/truncated arrays in JS - that pattern previously pushed
 * real deployment rows off page one and made page two's fixed offset skip them.
 */
export default async function fetchRecentDeploymentsQuery(appId?: number, {limit = 10, page = 1}: {limit?: number, page?: number} = {}): Promise<Deployment[]> {
  try {
    const appFilterDeployments = appId ? 'AND d.app_id = $1' : '';
    const appFilterQueue = appId ? 'AND dqj.app_id = $1' : '';
    const limitParam = appId ? '$2' : '$1';
    const offsetParam = appId ? '$3' : '$2';

    const query = `
      WITH combined AS (
        SELECT
          d.id,
          d.app_id,
          a.name AS app_name,
          a.repo_url AS app_repository,
          d.version,
          d.commit_id,
          d.status,
          d.deployed_at::timestamptz AS deployed_at,
          d.container_id,
          d.branch,
          FALSE AS is_queued,
          NULL::int AS queue_job_id,
          NULL::text AS queue_error
        FROM deployments d
        JOIN apps a ON a.id = d.app_id
        LEFT JOIN preview_branches pb ON pb.id = d.preview_branch_id
        WHERE (
          (d.is_preview = false OR d.is_preview IS NULL)
          OR
          (d.is_preview = true AND pb.deleted_at IS NULL)
        )
        ${appFilterDeployments}

        UNION ALL

        -- Requests that haven't produced a deployments row yet. deployment_id IS NULL
        -- covers 'queued' and the brief 'running'-but-not-yet-linked window alike, so this
        -- placeholder doesn't disappear during that transition; once a job is linked it
        -- drops out of this branch entirely (the real deployment row above already
        -- represents it), so a linked job is never returned by both branches at once.
        SELECT
          (-dqj.id) AS id,
          dqj.app_id,
          a.name AS app_name,
          a.repo_url AS app_repository,
          '' AS version,
          dqj.requested_sha AS commit_id,
          CASE WHEN dqj.status = 'running' THEN 'building' ELSE dqj.status END AS status,
          dqj.created_at::timestamptz AS deployed_at,
          NULL::text AS container_id,
          dqj.branch,
          TRUE AS is_queued,
          dqj.id AS queue_job_id,
          dqj.error AS queue_error
        FROM deploy_queue_jobs dqj
        JOIN apps a ON a.id = dqj.app_id
        WHERE dqj.deployment_id IS NULL
        ${appFilterQueue}
      )
      SELECT *
      FROM combined
      ORDER BY deployed_at DESC, id DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `;

    const result = await pool.query<DeploymentHistoryRow>(
      query,
      appId ? [appId, limit, (page - 1) * limit] : [limit, (page - 1) * limit]
    );

    return result.rows.map(mapDeploymentHistoryRow);
  } catch (error) {
    console.error('Error fetching recent deployments:', error);
    throw new Error('Failed to fetch recent deployments');
  }
}
