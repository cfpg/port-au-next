import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import {
  getDeployedProductionEnv,
  applyExportPostgresHost,
  formatEnvAsDotEnv,
  type ExportPostgresHost,
} from '~/services/appEnv';

function parseExportHost(value: string | null): ExportPostgresHost {
  if (value === 'postgres' || value === 'localhost' || value === 'host.docker.internal') {
    return value;
  }
  return 'host.docker.internal';
}

export const GET = withAuth(
  async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam, 10);

    if (Number.isNaN(appId)) {
      return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const host = parseExportHost(searchParams.get('host'));

    try {
      const app = await fetchSingleAppQuery({ appId });
      if (!app) {
        return NextResponse.json({ error: 'App not found' }, { status: 404 });
      }

      const deployedEnv = await getDeployedProductionEnv(app);
      const env = applyExportPostgresHost(deployedEnv, host);

      return NextResponse.json({
        env: formatEnvAsDotEnv(env),
        count: Object.keys(env).length,
        host,
      });
    } catch (error) {
      console.error('Error exporting environment variables:', error);
      return NextResponse.json(
        { error: 'Failed to export environment variables' },
        { status: 500 }
      );
    }
  }
);
