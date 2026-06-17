import { NextResponse } from 'next/server';

import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import pool from '~/services/database';
import logger from '~/services/logger';
import {
  UMAMI_SERVICE_TYPE,
  disableUmamiForApp,
  getUmamiAppCredentials,
  getUmamiDashboardUrl,
  provisionUmamiForApp,
} from '~/services/umami';

async function getApp(appId: number) {
  return fetchSingleAppQuery({ appId });
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
      [appId, UMAMI_SERVICE_TYPE]
    );

    if (rowResult.rows.length === 0) {
      return NextResponse.json({ enabled: false });
    }

    const row = rowResult.rows[0];
    const enabled = row.enabled !== false;

    if (!enabled) {
      return NextResponse.json({
        enabled: false,
        websiteId: row.public_key || undefined,
        dashboardUsername: row.username || undefined,
      });
    }

    const creds = await getUmamiAppCredentials(appId);
    if (!creds) {
      return NextResponse.json({ enabled: false });
    }

    return NextResponse.json({
      enabled: true,
      websiteId: creds.websiteId,
      dashboardUsername: creds.dashboardUsername,
      dashboardPassword: creds.dashboardPassword,
      dashboardUrl: getUmamiDashboardUrl(),
    });
  } catch (error) {
    console.error('Error fetching analytics status:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics status' }, { status: 500 });
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

    logger.info('Enabling Umami analytics for app', { appId });
    const creds = await provisionUmamiForApp(app);

    return NextResponse.json({
      enabled: true,
      websiteId: creds.websiteId,
      dashboardUsername: creds.dashboardUsername,
      dashboardPassword: creds.dashboardPassword,
      dashboardUrl: getUmamiDashboardUrl(),
      redeployRequired: true,
    });
  } catch (error) {
    console.error('Error enabling analytics:', error);
    const message = error instanceof Error ? error.message : 'Failed to enable analytics';
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

    await disableUmamiForApp(appId);

    return NextResponse.json({ enabled: false, redeployRequired: true });
  } catch (error) {
    console.error('Error disabling analytics:', error);
    const message = error instanceof Error ? error.message : 'Failed to disable analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
