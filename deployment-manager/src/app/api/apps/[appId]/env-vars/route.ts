import { NextResponse } from 'next/server';
import fetchAppEnvVars from '~/queries/fetchAppEnvVars';
import { withAuth } from '~/lib/auth-utils';

export const GET = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  const { searchParams } = new URL(request.url);
  const isPreview = searchParams.get('isPreview') === 'true';
  const appId = parseInt(params.appId);

  if (isNaN(appId)) {
    return NextResponse.json(
      { error: 'Invalid app ID' },
      { status: 400 }
    );
  }

  try {
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