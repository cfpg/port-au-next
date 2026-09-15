import { NextResponse } from 'next/server';
import { setupAppStorage } from '~/services/minio';
import pool from '~/services/database';
import { withAuth } from '~/lib/auth-utils';
import { generateBucketName } from '~/utils/bucket';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import fetchAppServiceCredentialsQuery from '~/queries/fetchAppServiceCredentialsQuery';
import logger from '~/services/logger';

export const GET = withAuth(async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam);
    if (isNaN(appId)) {
      return NextResponse.json(
        { error: 'Invalid app ID' },
        { status: 400 }
      );
    }

    const app = await fetchSingleAppQuery({ appId });
    if (!app) {
      return NextResponse.json(
        { error: 'App not found' },
        { status: 404 }
      );
    }

    const services = await fetchAppServiceCredentialsQuery(appId, 'minio', false);

    if (services.length === 0) {
      return NextResponse.json(null);
    }

    const service = services[0];
    return NextResponse.json({
      accessKey: service.public_key,
      secretKey: service.secret_key,
      bucket: generateBucketName(app.name, false)
    });
  } catch (error) {
    console.error('Error fetching object storage credentials:', error);
    return NextResponse.json(
      { error: 'Failed to fetch object storage credentials' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam);
    if (isNaN(appId)) {
      return NextResponse.json(
        { error: 'Invalid app ID' },
        { status: 400 }
      );
    }

    // Get app name for bucket creation
    const appResult = await pool.query(
      'SELECT * FROM apps WHERE id = $1',
      [appId]
    );

    if (appResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'App not found' },
        { status: 404 }
      );
    }

    const app = appResult.rows[0];

    // Set up object storage for the app
    logger.info('Setting up object storage for app', { appId });
    const credentials = await setupAppStorage(app);

    return NextResponse.json({
      accessKey: credentials.public_key,
      secretKey: credentials.secret_key,
      bucket: credentials.bucket
    });
  } catch (error) {
    console.error('Error setting up object storage:', error);
    return NextResponse.json(
      { error: 'Failed to set up object storage' },
      { status: 500 }
    );
  }
}); 