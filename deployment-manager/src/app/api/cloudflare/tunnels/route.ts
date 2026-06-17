import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import cloudflareTunnel from '~/services/cloudflareTunnel';

export const GET = withAuth(async () => {
  try {
    const tunnels = await cloudflareTunnel.listTunnels();
    return NextResponse.json({ tunnels });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list tunnels';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

export const POST = withAuth(async (request: Request) => {
  try {
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Tunnel name is required' }, { status: 400 });
    }

    const tunnel = await cloudflareTunnel.createTunnel(name);
    return NextResponse.json({ tunnel });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create tunnel';
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
