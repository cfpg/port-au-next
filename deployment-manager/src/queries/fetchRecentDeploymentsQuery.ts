import pool from '~/services/database';

export interface Deployment {
  id: number;
  app_id: number;
  app_name: string;
  version: string;
  commit_id: string;
  status: string;
  deployed_at: Date;
  container_id?: string;
}

export default async function fetchRecentDeploymentsQuery(appId?: number, {limit = 10, page = 1}: {limit?: number, page?: number} = {}): Promise<Deployment[]> {
  try {
    const query = `
      SELECT 
        d.*,
        a.name as app_name
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      ${appId ? 'WHERE d.app_id = $1' : ''}
      ORDER BY d.deployed_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await pool.query<Deployment>(
      query,
      appId ? [appId, limit, (page - 1) * limit] : [limit, (page - 1) * limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching recent deployments:', error);
    throw new Error('Failed to fetch recent deployments');
  }
} 