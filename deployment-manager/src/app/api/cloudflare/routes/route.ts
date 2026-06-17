import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import cloudflareTunnel from '~/services/cloudflareTunnel';

export const DELETE = withAuth(async (request: Request) => {
  try {
    const { searchParams } = new URL(request.url);
    const hostname = searchParams.get('hostname');
    if (!hostname) {
      return NextResponse.json({ error: 'hostname is required' }, { status: 400 });
    }

    await cloudflareTunnel.removePublishedApplication(hostname);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove route';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
