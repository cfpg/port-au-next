import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import {
  deleteGithubInstallationForApp,
  findGithubInstallationForApp,
} from '~/queries/githubInstallationsQuery';
import { clearInstallationTokenCache } from '~/services/githubApp';
import { isAutoDeployEnabled, disableAutoDeploy } from '~/services/appFeatures';
import getAppsDir from '~/utils/getAppsDir';
import path from 'path';
import fs from 'fs';

export const GET = withAuth(async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam, 10);
  if (Number.isNaN(appId)) {
    return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
  }

  const app = await fetchSingleAppQuery({ appId });
  if (!app) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  const installation = await findGithubInstallationForApp(appId);
  if (!installation) {
    return NextResponse.json({ connected: false });
  }

  // "Has this app's checkout ever been cloned" - lets the UI show a clear "click Deploy
  // to build for the first time" callout for a deferred-clone app that just connected,
  // without needing a dedicated DB flag for it.
  const appDir = path.join(getAppsDir(), app.name);
  const hasLocalCheckout = fs.existsSync(path.join(appDir, '.git'));
  const autoDeployEnabled = await isAutoDeployEnabled(appId);

  return NextResponse.json({
    connected: true,
    accountLogin: installation.account_login,
    repoFullName: installation.repo_full_name,
    connectedAt: installation.created_at,
    hasLocalCheckout,
    autoDeployEnabled,
  });
});

export const DELETE = withAuth(async (_request: Request, { params }: { params: Promise<{ appId: string }> }) => {
  const { appId: appIdParam } = await params;
  const appId = parseInt(appIdParam, 10);
  if (Number.isNaN(appId)) {
    return NextResponse.json({ error: 'Invalid app ID' }, { status: 400 });
  }

  const installation = await findGithubInstallationForApp(appId);

  // Disable Auto-deploy BEFORE removing the connection row, not after. These are two
  // separate writes (no shared transaction), so if the second one fails, the ORDER
  // decides which inconsistent state is left behind: disabling first means a failure
  // leaves the app still looking connected with Auto-deploy already off (safe - no worse
  // than before this request); disabling second (the previous order here) meant a failure
  // could leave the installation gone but Auto-deploy still enabled, which a later
  // reconnect would silently inherit - exactly the "reconnecting must not silently
  // re-enable it" guarantee this exists to uphold.
  await disableAutoDeploy(appId);

  if (installation) {
    clearInstallationTokenCache(Number(installation.installation_id));
  }
  await deleteGithubInstallationForApp(appId);

  return NextResponse.json({ success: true });
});
