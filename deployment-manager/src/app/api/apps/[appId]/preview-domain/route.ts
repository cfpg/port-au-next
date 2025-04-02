import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import pool from '~/services/database';

export const PATCH = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  const appId = parseInt(params.appId);

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

    await pool.query(
      `UPDATE apps 
       SET preview_domain = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [previewDomain, appId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating preview domain:', error);
    return NextResponse.json(
      { error: 'Failed to update preview domain' },
      { status: 500 }
    );
  }
}); 