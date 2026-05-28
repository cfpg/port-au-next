import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import { importAppEnvVarsQuery } from '~/queries/importAppEnvVarsQuery';

export const POST = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam, 10);

  if (Number.isNaN(appId)) {
    return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { branch = null, envVars } = body as {
      branch?: string | null;
      envVars?: Record<string, string>;
    };

    if (!envVars || typeof envVars !== 'object' || Array.isArray(envVars)) {
      return NextResponse.json({ error: 'envVars object is required' }, { status: 400 });
    }

    const result = await importAppEnvVarsQuery(appId, branch, envVars);

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Import failed' }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error importing environment variables:', error);
    return NextResponse.json({ error: 'Failed to import environment variables' }, { status: 500 });
  }
});
