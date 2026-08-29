import { NextResponse } from 'next/server';

import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import {
  disableTestDatabaseForApp,
  getTestDatabaseStatus,
  provisionTestDatabaseForApp,
} from '~/services/testDatabase';

function parseAppId(value: string): number | null {
  const appId = parseInt(value, 10);
  return Number.isNaN(appId) ? null : appId;
}

export const GET = withAuth(
  async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
    const { appId: value } = await params;
    const appId = parseAppId(value);
    if (appId === null) {
      return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
    }

    const app = await fetchSingleAppQuery({ appId });
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    return NextResponse.json(await getTestDatabaseStatus(appId));
  }
);

export const POST = withAuth(
  async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
    try {
      const { appId: value } = await params;
      const appId = parseAppId(value);
      if (appId === null) {
        return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
      }

      const app = await fetchSingleAppQuery({ appId });
      if (!app) {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }

      const status = await provisionTestDatabaseForApp(app);
      return NextResponse.json({ ...status, redeployRequired: true });
    } catch (error) {
      console.error('Error enabling test database:', error);
      const message = error instanceof Error ? error.message : 'Failed to enable test database';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);

export const PATCH = withAuth(
  async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
    try {
      const { appId: value } = await params;
      const appId = parseAppId(value);
      if (appId === null) {
        return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
      }

      const body = (await request.json()) as { enabled?: boolean };
      if (body.enabled !== false) {
        return NextResponse.json({ error: 'Only { "enabled": false } is supported' }, { status: 400 });
      }

      const app = await fetchSingleAppQuery({ appId });
      if (!app) {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }

      await disableTestDatabaseForApp(appId);
      return NextResponse.json({ enabled: false, redeployRequired: true });
    } catch (error) {
      console.error('Error disabling test database:', error);
      const message = error instanceof Error ? error.message : 'Failed to disable test database';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
