import pool from '~/services/database';

export default async function fetchActivePreviewBranchesQuery(appId: number) {
  const result = await pool.query(`
    WITH latest_deployments AS (
      SELECT DISTINCT ON (preview_branch_id)
        d.preview_branch_id,
        d.version as last_deployment_version,
        d.commit_id as last_deployment_commit,
        d.status as last_deployment_status,
        d.deployed_at as last_deployment_at
      FROM deployments d
      WHERE d.is_preview = true
      ORDER BY preview_branch_id, deployed_at DESC
    )
    SELECT 
      pb.id,
      pb.branch,
      pb.subdomain,
      pb.container_id,
      CASE
        WHEN pb.container_id IS NULL AND ld.last_deployment_status = 'failed' THEN 'failed'
        WHEN pb.container_id IS NULL AND ld.last_deployment_status = 'pending' THEN 'deploying'
        WHEN pb.container_id IS NOT NULL THEN 'active'
        ELSE 'stopped'
      END as status,
      ld.last_deployment_version,
      ld.last_deployment_commit,
      ld.last_deployment_status,
      ld.last_deployment_at
    FROM preview_branches pb
    LEFT JOIN latest_deployments ld ON ld.preview_branch_id = pb.id
    WHERE pb.app_id = $1
    AND pb.deleted_at IS NULL
    ORDER BY 
      ld.last_deployment_at DESC NULLS LAST,
      pb.created_at DESC
  `, [appId]);

  return result.rows;
}