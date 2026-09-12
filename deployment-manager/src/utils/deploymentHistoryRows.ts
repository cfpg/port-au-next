import { Deployment } from '~/types';

/** Shape of one row from fetchRecentDeploymentsQuery's combined SQL statement. */
export interface DeploymentHistoryRow {
  id: number;
  app_id: number;
  app_name: string;
  app_repository: string;
  version: string | null;
  commit_id: string | null;
  status: string;
  deployed_at: string | Date;
  container_id: string | null;
  branch: string | null;
  is_queued: boolean;
  queue_job_id: number | null;
  queue_error: string | null;
}

/**
 * Pure row -> UI-type mapping, kept separate from the SQL/DB call so it's testable without
 * a database: given a raw combined-query row, produce the `Deployment` the tables render.
 * The SQL side already negates `id` for a queued row and resolves 'running' (claimed, not
 * yet linked) to 'building' for display - this only reshapes field names/nullability.
 */
export function mapDeploymentHistoryRow(row: DeploymentHistoryRow): Deployment {
  return {
    id: row.id,
    app_id: row.app_id,
    app_name: row.app_name,
    app_repository: row.app_repository,
    version: row.version ?? '',
    commit_id: row.commit_id ?? undefined,
    status: row.status,
    deployed_at: row.deployed_at instanceof Date ? row.deployed_at.toISOString() : row.deployed_at,
    container_id: row.container_id ?? undefined,
    branch: row.branch ?? undefined,
    isQueued: row.is_queued,
    queueJobId: row.queue_job_id ?? undefined,
    queueError: row.queue_error ?? undefined,
  };
}
