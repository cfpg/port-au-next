import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import cloudflareTunnel from '~/services/cloudflareTunnel';

export const GET = withAuth(
  async (request: Request, { params }: { params: Promise<{ tunnelId: string }> }) => {
    try {
      const { tunnelId } = await params;
      const routes = await cloudflareTunnel.listPublishedApplications(tunnelId);
      return NextResponse.json({ routes });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to list published applications';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
);
