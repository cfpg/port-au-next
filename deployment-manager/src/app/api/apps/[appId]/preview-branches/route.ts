import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import fetchActivePreviewBranchesQuery from '~/queries/fetchActivePreviewBranches';

export const GET = withAuth(async (request: Request, { params }: { params: { appId: string } }) => {
  try {
    const { appId: appIdParam } = await params;
    const appId = parseInt(appIdParam);

    const result = await fetchActivePreviewBranchesQuery(appId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching preview branches:', error);
    return NextResponse.json({ error: 'Failed to fetch preview branches' }, { status: 500 });
  }
});
