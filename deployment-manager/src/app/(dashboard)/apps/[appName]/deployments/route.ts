import { NextResponse } from 'next/server';
import fetchLogs from '~/queries/fetchLogs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appName = searchParams.get('appName');
  const deploymentId = searchParams.get('deploymentId');

  if (!appName || !deploymentId) {
    return NextResponse.json(
      { error: 'Missing required parameters' },
      { status: 400 }
    );
  }

  try {
    const {app, logs} = await fetchLogs(appName, Number(deploymentId));

    return NextResponse.json({
      app,
      logs
    });
  } catch (error) {
    console.error('Error fetching deployment data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deployment data' },
      { status: 500 }
    );
  }
} 