import { NextResponse } from 'next/server';

import { getReadiness } from '~/lib/readiness';

export const dynamic = 'force-dynamic';

export function GET() {
  const state = getReadiness();

  return NextResponse.json(
    {
      status: state.ready ? 'ready' : 'not_ready',
      reason: state.reason,
    },
    { status: state.ready ? 200 : 503 }
  );
}
