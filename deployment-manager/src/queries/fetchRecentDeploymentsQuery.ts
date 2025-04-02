import pool from '~/services/database';
import { Deployment } from '~/types';
export default async function fetchRecentDeploymentsQuery(appId?: number, {limit = 10, page = 1}: {limit?: number, page?: number} = {}): Promise<Deployment[]> {
  try {
    const query = `
      SELECT 
        d.*,
        a.name as app_name,
        a.repo_url as app_repository,
        d.branch as branch
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      ${appId ? 'WHERE d.app_id = $1' : ''}
      ORDER BY d.deployed_at DESC
      LIMIT ${appId ? '$2' : '$1'} OFFSET ${appId ? '$3' : '$2'};
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