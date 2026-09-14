import pool from '~/services/database';

export async function updateDeploymentStatus(
  deploymentId: number,
  status: string
): Promise<void> {
  if (status === 'inactive') {
    await pool.query(
      `UPDATE deployments
       SET status = $1, inactive_at = COALESCE(inactive_at, CURRENT_TIMESTAMP)
       WHERE id = $2`,
      [status, deploymentId]
    );
    return;
  }

  if (status === 'failed') {
    await pool.query(
      `UPDATE deployments
       SET status = $1, failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP)
       WHERE id = $2`,
      [status, deploymentId]
    );
    return;
  }

  await pool.query('UPDATE deployments SET status = $1 WHERE id = $2', [status, deploymentId]);
}

/**
 * Persists the container/commit a deployment resolved to, BEFORE traffic is switched to
 * it. Recovery after a crash relies on this having already happened regardless of which
 * side of the switch the crash landed on - see recoverContainers()/cleanupStaleBuildingDeployments().
 */
export async function recordDeploymentContainer(
  deploymentId: number,
  commitId: string,
  containerId: string
): Promise<void> {
  await pool.query(
    `UPDATE deployments SET commit_id = $1, container_id = $2 WHERE id = $3`,
    [commitId, containerId, deploymentId]
  );
}

export async function markDeploymentInactiveByContainerId(containerId: string): Promise<void> {
  await pool.query(
    `UPDATE deployments
     SET status = 'inactive', inactive_at = COALESCE(inactive_at, CURRENT_TIMESTAMP)
     WHERE container_id = $1`,
    [containerId]
  );
}
