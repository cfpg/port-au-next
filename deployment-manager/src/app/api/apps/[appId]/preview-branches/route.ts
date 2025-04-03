import { NextResponse } from 'next/server';
import pool from '~/services/database';
import { withAuth } from '~/lib/auth-utils';

export const GET = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam);

    const result = await pool.query(`
      SELECT 
        pb.*,
        d.version as last_deployment_version,
        d.commit_id as last_deployment_commit,
        d.status as last_deployment_status,
        d.deployed_at as last_deployment_at
      FROM preview_branches pb
      LEFT JOIN LATERAL (
        SELECT *
        FROM deployments
        WHERE preview_branch_id = pb.id
        ORDER BY deployed_at DESC
        LIMIT 1
      ) d ON true
      WHERE pb.app_id = $1
      ORDER BY pb.created_at DESC
    `, [appId]);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching preview branches:', error);
    return NextResponse.json({ error: 'Failed to fetch preview branches' }, { status: 500 });
  }
}); 