import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import { findGithubInstallationForApp } from '~/queries/githubInstallationsQuery';
import { listRepositoryBranches } from '~/services/githubApp';
import { normalizeGithubRepoFullName } from '~/utils/githubRepoMatch';

/**
 * Lists branch names for a connected app's repository, for a branch picker (preview-branch
 * deploy, app settings) instead of a free-typed name. Read-only - never mints anything
 * beyond the same repo-scoped token git clone/fetch already uses, never writes anything.
 */
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
    return NextResponse.json({ connected: false, branches: [] });
  }

  // Same repo-consistency check resolveGitAuth() applies before deploying - a stale
  // connection (app's repo_url edited since connecting) must not silently list branches
  // from the wrong repository.
  const normalizedRepoUrl = normalizeGithubRepoFullName(app.repo_url);
  if (!normalizedRepoUrl || normalizedRepoUrl !== installation.repo_full_name.toLowerCase()) {
    return NextResponse.json(
      {
        error:
          "This app's repository has changed since GitHub was connected. Disconnect and reconnect " +
          'GitHub for the current repository before listing branches.',
      },
      { status: 409 }
    );
  }

  try {
    const branches = await listRepositoryBranches(
      Number(installation.installation_id),
      Number(installation.repo_id),
      installation.repo_full_name
    );
    return NextResponse.json({ connected: true, branches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list branches from GitHub' },
      { status: 502 }
    );
  }
});
