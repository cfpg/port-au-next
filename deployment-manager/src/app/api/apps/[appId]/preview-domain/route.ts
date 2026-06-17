import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import pool from '~/services/database';
import { syncPreviewWildcardRoute } from '~/services/cloudflareRoutes';

export const PATCH = withAuth(async (request: Request, { params }: { params: Promise<{ appId: string }> }) => {
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
    const { previewDomain } = body;

    if (!previewDomain) {
      return NextResponse.json(
        { error: 'Preview domain is required' },
        { status: 400 }
      );
    }

    const existing = await pool.query<{ preview_domain: string | null }>(
      'SELECT preview_domain FROM apps WHERE id = $1',
      [appId]
    );
    const previousPreviewDomain = existing.rows[0]?.preview_domain ?? null;

    await pool.query(
      `UPDATE apps 
       SET preview_domain = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [previewDomain, appId]
    );

    const routeResult = await syncPreviewWildcardRoute(
      appId,
      previewDomain,
      previousPreviewDomain
    );
    if (!routeResult.success && routeResult.error) {
      return NextResponse.json({ error: routeResult.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating preview domain:', error);
    return NextResponse.json(
      { error: 'Failed to update preview domain' },
      { status: 500 }
    );
  }
}); 