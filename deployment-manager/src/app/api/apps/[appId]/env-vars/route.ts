import { NextResponse } from 'next/server';
import fetchAppEnvVars from '~/queries/fetchAppEnvVars';
import { withAuth } from '~/lib/auth-utils';
import pool from '~/services/database';

export const GET = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  const { searchParams } = new URL(request.url);
  const isPreviewParam = searchParams.get('isPreview');
  const isPreview = isPreviewParam === 'true' || isPreviewParam === '1' || isPreviewParam === 'True';
  
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam);

  if (isNaN(appId)) {
    return NextResponse.json(
      { error: 'Invalid app ID' },
      { status: 400 }
    );
  }

  try {
    console.log(`Fetching env vars for app ${appId}, isPreview: ${isPreview}`);
    const envVars = await fetchAppEnvVars(appId, isPreview);
    return NextResponse.json(envVars);
  } catch (error) {
    console.error('Error fetching environment variables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch environment variables' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam);

  if (isNaN(appId)) {
    return NextResponse.json(
      { error: 'Invalid app ID' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const { branch, envVars } = body;

    // Determine if this is a preview environment based on the branch
    const isPreview = branch === null || branch !== (await getAppBranch(appId));

    // Delete existing env vars for this app and environment
    await pool.query(
      `DELETE FROM app_env_vars WHERE app_id = $1 AND is_preview = $2`,
      [appId, isPreview]
    );

    // Insert new env vars
    if (Object.keys(envVars).length > 0) {
      const values = Object.entries(envVars).map(([key, value]) => {
        return `(${appId}, '${key}', '${value}', ${isPreview ? 'true' : 'false'}, ${branch ? `'${branch}'` : 'NULL'})`;
      }).join(', ');

      await pool.query(
        `INSERT INTO app_env_vars (app_id, key, value, is_preview, branch) VALUES ${values}`
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating environment variables:', error);
    return NextResponse.json(
      { error: 'Failed to update environment variables' },
      { status: 500 }
    );
  }
});

// Helper function to get the app's production branch
async function getAppBranch(appId: number): Promise<string> {
  const result = await pool.query(
    `SELECT branch FROM apps WHERE id = $1`,
    [appId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('App not found');
  }
  
  return result.rows[0].branch;
} 