import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { withAuth } from '~/lib/auth-utils';
import { auth } from '~/lib/auth';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import { createConnectState } from '~/queries/githubConnectStatesQuery';
import { getGithubAppConfig } from '~/services/githubApp';

export const POST = withAuth(async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam, 10);
  if (Number.isNaN(appId)) {
    return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
  }

  const app = await fetchSingleAppQuery({ appId });
  if (!app) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  const config = await getGithubAppConfig();
  if (!config || !config.appSlug) {
    return NextResponse.json(
      { error: 'GitHub App is not configured yet. Set it up in Settings first.' },
      { status: 400 }
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const state = await createConnectState(appId, session.user.id);

  return NextResponse.json({
    url: `https://github.com/apps/${config.appSlug}/installations/new?state=${encodeURIComponent(state)}`,
  });
});
