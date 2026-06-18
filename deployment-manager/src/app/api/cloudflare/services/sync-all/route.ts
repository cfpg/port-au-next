import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import { syncAllPlatformServices } from '~/services/cloudflarePlatformServices';

export const POST = withAuth(async () => {
  try {
    const result = await syncAllPlatformServices();

    if (!result.success) {
      return NextResponse.json(
        { error: result.errors.join('. '), status: result.status },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, status: result.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to sync platform services';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
