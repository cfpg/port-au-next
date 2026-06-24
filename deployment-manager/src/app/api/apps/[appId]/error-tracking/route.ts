import { NextResponse } from 'next/server';

import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import pool from '~/services/database';
import logger from '~/services/logger';
import {
  BUGSINK_SERVICE_TYPE,
  disableBugsinkForApp,
  getBugsinkAppCredentials,
  getBugsinkDashboardUrl,
  getBugsinkProjectDashboardUrl,
  maskDsn,
  provisionBugsinkForApp,
} from '~/services/bugsink';

async function getApp(appId: number) {
  return fetchSingleAppQuery({ appId });
}

function toErrorTrackingResponse(creds: {
  projectId: string;
  projectSlug: string;
  dsn: string;
  dashboardUsername: string;
  dashboardPassword: string;
}) {
  return {
    enabled: true as const,
    projectId: creds.projectId,
    projectSlug: creds.projectSlug,
    dsn: creds.dsn,
    dsnMasked: maskDsn(creds.dsn),
    dashboardUsername: creds.dashboardUsername || undefined,
    dashboardPassword: creds.dashboardPassword || undefined,
    dashboardUrl: getBugsinkDashboardUrl(),
    projectDashboardUrl: creds.projectSlug
      ? getBugsinkProjectDashboardUrl(creds.projectSlug)
      : getBugsinkDashboardUrl(),
  };
}

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam, 10);
    if (Number.isNaN(appId)) {
      return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
    }

    const app = await getApp(appId);
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const rowResult = await pool.query(
      `SELECT enabled, public_key, username, password
       FROM app_services
       WHERE app_id = $1 AND service_type = $2 AND is_preview = false`,
      [appId, BUGSINK_SERVICE_TYPE]
    );

    if (rowResult.rows.length === 0) {
      return NextResponse.json({ enabled: false });
    }

    const row = rowResult.rows[0];
    const enabled = row.enabled !== false;

    if (!enabled) {
      return NextResponse.json({
        enabled: false,
        projectId: row.public_key || undefined,
        dashboardUsername: row.username || undefined,
      });
    }

    const creds = await getBugsinkAppCredentials(appId);
    if (!creds) {
      return NextResponse.json({ enabled: false });
    }

    return NextResponse.json(toErrorTrackingResponse(creds));
  } catch (error) {
    console.error('Error fetching error tracking status:', error);
    return NextResponse.json({ error: 'Failed to fetch error tracking status' }, { status: 500 });
  }
});

export const POST = withAuth(async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam, 10);
    if (Number.isNaN(appId)) {
      return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
    }

    const app = await getApp(appId);
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    logger.info('Enabling Bugsink error tracking for app', { appId });
    const creds = await provisionBugsinkForApp(app);

    return NextResponse.json({
      ...toErrorTrackingResponse(creds),
      redeployRequired: true,
    });
  } catch (error) {
    console.error('Error enabling error tracking:', error);
    const message = error instanceof Error ? error.message : 'Failed to enable error tracking';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

export const PATCH = withAuth(async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam, 10);
    if (Number.isNaN(appId)) {
      return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
    }

    const body = (await request.json()) as { enabled?: boolean };
    if (body.enabled !== false) {
      return NextResponse.json({ error: 'Only { "enabled": false } is supported' }, { status: 400 });
    }

    const app = await getApp(appId);
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    await disableBugsinkForApp(appId);

    return NextResponse.json({ enabled: false, redeployRequired: true });
  } catch (error) {
    console.error('Error disabling error tracking:', error);
    const message = error instanceof Error ? error.message : 'Failed to disable error tracking';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
