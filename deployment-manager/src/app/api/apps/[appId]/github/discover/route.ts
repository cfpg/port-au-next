import { NextResponse } from 'next/server';
import { withAuth } from '~/lib/auth-utils';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import { upsertGithubInstallation } from '~/queries/githubInstallationsQuery';
import { findInstallationForRepo } from '~/services/githubApp';

/**
 * Asks GitHub directly whether any installation of this platform's App already has
 * access to this app's repository, and connects it if so - without requiring a fresh
 * redirect through GitHub's install flow. Covers the case where an installation already
 * exists (created earlier, or via GitHub's own UI) but our connect callback never ran to
 * record it - the redirect flow only fires on a fresh install or an update-with-redirect,
 * neither of which applies to an installation that already exists and isn't being changed.
 */
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

  const result = await findInstallationForRepo(app.repo_url);

  switch (result.status) {
    case 'invalid_repo_url':
      return NextResponse.json(
        { error: `"${app.repo_url}" doesn't look like a github.com repository URL.` },
        { status: 400 }
      );
    case 'not_found':
      return NextResponse.json(
        {
          error:
            'No installation of the GitHub App has access to this repository yet. ' +
            'Use Connect GitHub to install it, or grant an existing installation access to this repo on GitHub.',
        },
        { status: 404 }
      );
    case 'ambiguous':
      return NextResponse.json(
        {
          error:
            'More than one installation has access to this repository (' +
            result.matches.map((m) => m.accountLogin).join(', ') +
            '). Remove access from all but one before using this.',
        },
        { status: 409 }
      );
    case 'found': {
      await upsertGithubInstallation({
        appId: app.id,
        installationId: result.installationId,
        accountLogin: result.accountLogin,
        repoId: result.repo.id,
        repoFullName: result.repo.fullName,
      });
      return NextResponse.json({
        success: true,
        accountLogin: result.accountLogin,
        repoFullName: result.repo.fullName,
      });
    }
  }
});
