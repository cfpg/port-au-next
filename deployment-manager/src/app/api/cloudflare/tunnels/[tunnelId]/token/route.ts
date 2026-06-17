import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import cloudflareTunnel from '~/services/cloudflareTunnel';

export const GET = withAuth(
  async (_request: Request, { params }: { params: Promise<{ tunnelId: string }> }) => {
    try {
      const { tunnelId } = await params;
      const token = await cloudflareTunnel.getTunnelToken(tunnelId);
      return NextResponse.json({ token });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch tunnel token';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
);
