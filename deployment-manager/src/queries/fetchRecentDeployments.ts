import pool from '~/services/database';
import { Deployment } from '~/types';

export default async function fetchRecentDeployments(): Promise<Deployment[]> {
  try {
    const result = await pool.query<Deployment>(`
      SELECT d.*, a.name as app_name
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      ORDER BY d.deployed_at DESC
      LIMIT 10
    `);

    return result.rows;
  } catch (error) {
    console.error('Error fetching recent deployments:', error);
    throw new Error('Failed to fetch recent deployments');
  }
} 