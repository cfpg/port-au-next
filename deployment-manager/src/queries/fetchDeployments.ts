import pool from '~/services/database';

export interface Deployment {
  id: number;
  app_id: number;
  commit_id: string;
  version: string;
  status: string;
  container_id: string;
  deployed_at: Date;
}

export default async function fetchDeployments(): Promise<Deployment[]> {
  try {
    const result = await pool.query<Deployment>(`
      SELECT 
        id,
        app_id,
        commit_id,
        version,
        status,
        container_id,
        deployed_at
      FROM deployments
      ORDER BY deployed_at DESC
      LIMIT 10;
    `);

    return result.rows;
  } catch (error) {
    console.error('Error fetching deployments:', error);
    throw new Error('Failed to fetch deployments');
  }
} 