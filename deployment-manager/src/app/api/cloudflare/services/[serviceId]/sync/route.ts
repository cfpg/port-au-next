import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import { syncPlatformService } from '~/services/cloudflarePlatformServices';

export const POST = withAuth(
  async (_request: Request, { params }: { params: Promise<{ serviceId: string }> }) => {
    try {
      const { serviceId } = await params;
      const result = await syncPlatformService(serviceId);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error ?? 'Failed to sync service route', status: result.status },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, status: result.status });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to sync platform service route';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
);
