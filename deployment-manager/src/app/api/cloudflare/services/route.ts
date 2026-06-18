import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import { getPlatformServicesCloudflareStatus } from '~/services/cloudflarePlatformServices';

export const GET = withAuth(async () => {
  try {
    const status = await getPlatformServicesCloudflareStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching platform Cloudflare services:', error);
    return NextResponse.json(
      { error: 'Failed to fetch platform service Cloudflare status' },
      { status: 500 }
    );
  }
});
