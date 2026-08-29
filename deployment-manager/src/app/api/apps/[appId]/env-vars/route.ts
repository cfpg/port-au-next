import { NextResponse } from 'next/server';
import fetchAppEnvVars from '~/queries/fetchAppEnvVars';
import { withAuth } from '~/lib/auth-utils';
import { withTransaction } from '~/services/database';

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
    const { branch = null, isPreview, envVars } = body as {
      branch?: string | null;
      isPreview?: boolean;
      envVars?: Record<string, string>;
    };

    if (typeof isPreview !== 'boolean' || !envVars || typeof envVars !== 'object' || Array.isArray(envVars)) {
      return NextResponse.json(
        { error: 'isPreview boolean and envVars object are required' },
        { status: 400 }
      );
    }

    const branchForRow = isPreview ? branch : null;
    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM app_env_vars WHERE app_id = $1 AND is_preview = $2`,
        [appId, isPreview]
      );

      for (const [key, value] of Object.entries(envVars)) {
        await client.query(
          `INSERT INTO app_env_vars (app_id, key, value, is_preview, branch)
           VALUES ($1, $2, $3, $4, $5)`,
          [appId, key, value, isPreview, branchForRow]
        );
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating environment variables:', error);
    return NextResponse.json(
      { error: 'Failed to update environment variables' },
      { status: 500 }
    );
  }
});
