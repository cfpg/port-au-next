import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import { deletePreviewBranch } from '~/services/previewBranches';

export const DELETE = withAuth(async (request: Request, { params }: { params: { appId: string; branch: string } }) => {
  try {
    const appId = parseInt(params.appId);
    const branch = params.branch;

    await deletePreviewBranch(appId, branch);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting preview branch:', error);
    return NextResponse.json({ error: 'Failed to delete preview branch' }, { status: 500 });
  }
}); 