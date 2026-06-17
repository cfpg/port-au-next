import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import { getAppCloudflareStatus } from '~/services/cloudflareAppStatus';
import {
  syncAppDomainRoute,
  syncPreviewWildcardRoute,
} from '~/services/cloudflareRoutes';
import { isPreviewBranchesEnabled } from '~/services/previewBranches';

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam, 10);
    if (Number.isNaN(appId)) {
      return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
    }

    const app = await fetchSingleAppQuery({ appId });
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const status = await getAppCloudflareStatus(appId);
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching app Cloudflare status:', error);
    return NextResponse.json({ error: 'Failed to fetch Cloudflare status' }, { status: 500 });
  }
});

export const POST = withAuth(async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam, 10);
    if (Number.isNaN(appId)) {
      return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
    }

    const app = await fetchSingleAppQuery({ appId });
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const scope = body.scope === 'preview' ? 'preview' : body.scope === 'all' ? 'all' : 'domain';

    const errors: string[] = [];

    if (scope === 'domain' || scope === 'all') {
      if (!app.domain) {
        errors.push('App has no domain configured');
      } else {
        const result = await syncAppDomainRoute(appId, app.domain);
        if (!result.success && result.error) {
          errors.push(result.error);
        }
      }
    }

    if (scope === 'preview' || scope === 'all') {
      const previewEnabled = await isPreviewBranchesEnabled(appId);
      if (!previewEnabled) {
        if (scope === 'preview') {
          errors.push('Preview branches are not enabled');
        }
      } else if (!app.preview_domain) {
        errors.push('Preview domain is not configured');
      } else {
        const result = await syncPreviewWildcardRoute(appId, app.preview_domain);
        if (!result.success && result.error) {
          errors.push(result.error);
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 });
    }

    const status = await getAppCloudflareStatus(appId);
    return NextResponse.json({ success: true, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync Cloudflare route';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
