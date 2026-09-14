import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { withAuth } from '~/lib/auth-utils';
import { auth } from '~/lib/auth';
import fetchSingleAppQuery from '~/queries/fetchSingleAppQuery';
import { consumeConnectState } from '~/queries/githubConnectStatesQuery';
import { upsertGithubInstallation } from '~/queries/githubInstallationsQuery';
import { listInstallationRepositories, verifyInstallationBelongsToApp } from '~/services/githubApp';
import { resolveGithubConnectOutcome, ConnectFlowResult } from '~/services/githubConnectFlow';
import logger from '~/services/logger';

const ERROR_MESSAGES: Record<Exclude<ConnectFlowResult, { ok: true }>['reason'], string> = {
  expired_or_replayed: 'This connection request has expired or was already used. Click Connect GitHub again.',
  app_not_found: 'The app this connection was started for no longer exists.',
  wrong_user: 'This connection must be completed by the same session that started it.',
  wrong_app: "That installation does not belong to this platform's GitHub App.",
  invalid_repo_url: "This app's repository URL doesn't look like a github.com repository.",
  repo_not_accessible:
    "This installation doesn't have access to this app's repository. Grant it access to that " +
    'exact repository on GitHub (or update the app\'s repository URL first), then reconnect.',
};

/**
 * Browser-driven redirect from GitHub after "Connect GitHub" - this route has no public
 * middleware exception (see middleware.ts's allowlist, unchanged by this milestone): the
 * request carries the operator's own session cookie, and withAuth below re-checks it, the
 * same defense-in-depth every other route in this app already uses. Trust in the
 * installation_id GitHub hands back comes entirely from consuming the single-use state
 * token this platform minted and then independently verifying the installation against
 * the GitHub API - never from the query string alone. The actual accept/reject decision is
 * resolveGithubConnectOutcome() (githubConnectFlow.ts), kept pure and unit-tested
 * separately from this route's plumbing.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const url = new URL(request.url);
  const installationIdParam = url.searchParams.get('installation_id');
  const state = url.searchParams.get('state');
  const setupAction = url.searchParams.get('setup_action');

  const fail = (message: string, appName?: string) => {
    const target = appName ? `/apps/${appName}/settings` : '/apps';
    return NextResponse.redirect(
      new URL(`${target}?github=error&message=${encodeURIComponent(message)}`, url.origin)
    );
  };

  if (setupAction === 'request') {
    // Operator without install rights on the org requested access; nothing to connect yet.
    return fail('GitHub App installation request sent - an org owner must approve it.');
  }

  if (!installationIdParam || !state) {
    return fail('Missing installation_id or state from GitHub.');
  }

  const installationId = Number(installationIdParam);
  if (!Number.isFinite(installationId)) {
    return fail('Invalid installation_id from GitHub.');
  }

  const consumedState = await consumeConnectState(state);
  // App lookup happens even when the state is already invalid, purely so a later failure
  // (wrong_user, wrong_app, etc.) can redirect back to that specific app's settings page
  // instead of the generic apps list - resolveGithubConnectOutcome still short-circuits on
  // expired_or_replayed first regardless of whether `app` resolved.
  const app = consumedState ? await fetchSingleAppQuery({ appId: consumedState.app_id }) : null;

  const session = await auth.api.getSession({ headers: await headers() });

  let installationInfo = null;
  let accessibleRepos: Awaited<ReturnType<typeof listInstallationRepositories>> = [];
  if (consumedState && app && session?.user?.id === consumedState.user_id) {
    installationInfo = await verifyInstallationBelongsToApp(installationId);
    if (installationInfo) {
      try {
        accessibleRepos = await listInstallationRepositories(installationId);
      } catch (error) {
        await logger.error('Failed to list installation repositories', error as Error);
        return fail('Could not read the installation\'s repository access from GitHub.', app.name);
      }
    }
  }

  const outcome = resolveGithubConnectOutcome({
    consumedState,
    sessionUserId: session?.user?.id,
    app,
    installationInfo,
    accessibleRepos,
  });

  if (!outcome.ok) {
    return fail(ERROR_MESSAGES[outcome.reason], outcome.appName);
  }

  await upsertGithubInstallation({
    appId: app!.id,
    installationId,
    accountLogin: outcome.accountLogin,
    repoId: outcome.repo.id,
    repoFullName: outcome.repo.fullName,
  });

  return NextResponse.redirect(new URL(`/apps/${outcome.appName}/settings?github=connected`, url.origin));
});
