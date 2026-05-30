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

export async function markDeploymentInactiveByContainerId(containerId: string): Promise<void> {
  await pool.query(
    `UPDATE deployments
     SET status = 'inactive', inactive_at = COALESCE(inactive_at, CURRENT_TIMESTAMP)
     WHERE container_id = $1`,
    [containerId]
  );
}
