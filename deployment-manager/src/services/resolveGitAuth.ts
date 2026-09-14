import logger from '~/services/logger';
import { GitAuthEnv } from '~/services/git';
import { findGithubInstallationForApp, GithubInstallationRow } from '~/queries/githubInstallationsQuery';
import { getInstallationToken, ensureGitAskpassScript } from '~/services/githubApp';
import { buildCredentialFreeCloneUrl, normalizeGithubRepoFullName } from '~/utils/githubRepoMatch';
import { App } from '~/types';

export class GithubRepoMismatchError extends Error {
  constructor(appRepoUrl: string, installedRepoFullName: string) {
    super(
      `This app's repository (${appRepoUrl}) no longer matches the repository the connected ` +
        `GitHub installation was set up for (${installedRepoFullName}). The app's repository URL ` +
        `was likely changed after connecting GitHub - disconnect and reconnect GitHub for this app ` +
        `to deploy from its current repository.`
    );
    this.name = 'GithubRepoMismatchError';
  }
}

/**
 * The exact installation/repository identity a webhook-triggered queue job was accepted
 * against (`deploy_queue_jobs.installation_id`/`repo_id`, captured at enqueue time - see
 * deployQueue.ts's enqueueGithubPushEvent).
 */
export interface WebhookJobOrigin {
  installationId: string;
  repoId: string;
}

export class GithubConnectionChangedError extends Error {
  constructor() {
    super(
      "This push was queued against a specific GitHub installation and repository, but the app's " +
        'GitHub connection has since changed (disconnected, reconnected, or repointed at a different ' +
        'installation/repository). Refusing to deploy through a different credential or repository than ' +
        'the one this push was originally accepted for - a fresh push or a manual deploy will pick up ' +
        'the current connection.'
    );
    this.name = 'GithubConnectionChangedError';
  }
}

/**
 * Throws unless the app's CURRENT GitHub connection is exactly the installation+repository
 * a webhook job was queued against (GithubConnectionChangedError) AND the app's CURRENT
 * repo_url still matches what that installation is connected for (GithubRepoMismatchError -
 * same check resolveGitAuth applies for a manual job, applied here too so a repo_url edit
 * that happens while a webhook job is queued is caught just as early as an actual
 * disconnect/reconnect). On success, returns the installation row that was validated -
 * callers MUST use that same row for anything downstream instead of re-querying: querying
 * again read-your-own-write-style would reopen the exact race this function exists to
 * close (see resolveGitAuth() below, which does exactly this).
 *
 * Exported separately from resolveGitAuth() (which calls this for its own webhookOrigin
 * check) so the queue worker can run this cheap, no-side-effects check up front - before
 * ensurePreviewBranch() provisions anything - rather than only discovering a stale
 * connection after a preview database/subdomain has already been created for a job that's
 * about to be rejected anyway.
 */
export async function assertWebhookConnectionUnchanged(
  app: { id: number; repo_url: string },
  origin: WebhookJobOrigin
): Promise<GithubInstallationRow> {
  const installation = await findGithubInstallationForApp(app.id);
  if (
    !installation ||
    String(installation.installation_id) !== origin.installationId ||
    String(installation.repo_id) !== origin.repoId
  ) {
    throw new GithubConnectionChangedError();
  }

  const currentRepoFullName = normalizeGithubRepoFullName(app.repo_url);
  if (!currentRepoFullName || currentRepoFullName !== installation.repo_full_name.toLowerCase()) {
    throw new GithubRepoMismatchError(app.repo_url, installation.repo_full_name);
  }

  return installation;
}

/**
 * If this app has a connected GitHub installation, mints a fresh repo-scoped installation
 * token and returns everything prepareWorkspaceAtCommit needs to clone/fetch it - an app
 * with no installation gets undefined and behaves exactly as before (unconnected
 * SSH/public-repo deploys are unaffected). The token is registered for additive redaction
 * immediately, so it can never leak through logs, subprocess errors, or the queue's error
 * field even if something downstream throws before the git call itself runs.
 *
 * Kept in its own module (deploymentExecutor.ts just calls it) so it's testable without
 * dragging in the executor's whole dependency graph (release pipeline, nginx, cloudflare).
 *
 * Before minting a token, confirms the app's CURRENT repo_url still matches the repository
 * the stored installation was connected for. Without this check, editing an app's repo_url
 * after connecting GitHub would silently keep deploying the old (connected) repository -
 * the installation lookup is keyed by app_id alone, with no awareness that repo_url changed
 * underneath it. SSH/HTTPS formatting differences are normalized away so re-saving the same
 * repository in a different URL style doesn't false-positive as a mismatch.
 *
 * `webhookOrigin`, when given, additionally requires the CURRENT installation to be the
 * exact same installation+repository the job was queued against (see
 * `deployQueue.ts`'s `enqueueGithubPushEvent`). A webhook job carries that identity
 * because the repo_url-based check above isn't enough on its own: an app could disconnect
 * and reconnect to a *different* installation that happens to also have access to a
 * repository whose full name still normalizes to match `repo_url` (e.g. reinstalled on a
 * different account/fork with the same name), and the repo_url check alone would not catch
 * that swap. Manual jobs don't carry this identity and skip this stricter check - the
 * repo_url check above already protects them, and there's no "queued against a specific
 * installation" concept to fall stale for a manual deploy.
 *
 * For a webhook job, the installation validated by assertWebhookConnectionUnchanged() is
 * the SAME object used below for the repo_url check and the token mint - never re-queried.
 * A second, independent `findGithubInstallationForApp` call here would reopen the exact
 * race the check exists to close: the connection could change in the gap between two
 * separate reads, letting a disconnect-between-reads fall through to the unconnected-app
 * path below (silently unauthenticated) or a reconnect-between-reads mint a token for a
 * different installation/repository than what was just validated.
 */
export async function resolveGitAuth(app: App, webhookOrigin?: WebhookJobOrigin): Promise<GitAuthEnv | undefined> {
  let installation: GithubInstallationRow | null;

  if (webhookOrigin) {
    // Throws (never falls through to "no auth") on a missing, disconnected, reconnected,
    // or repo_url-diverged connection - a webhook job must never attempt the deploy with
    // the host's own SSH/public git credentials against what may be a private repository,
    // or silently succeed against whatever happens to already be checked out on disk.
    installation = await assertWebhookConnectionUnchanged(app, webhookOrigin);
  } else {
    installation = await findGithubInstallationForApp(app.id);
    if (!installation) {
      return undefined;
    }

    const currentRepoFullName = normalizeGithubRepoFullName(app.repo_url);
    if (!currentRepoFullName || currentRepoFullName !== installation.repo_full_name.toLowerCase()) {
      throw new GithubRepoMismatchError(app.repo_url, installation.repo_full_name);
    }
  }

  const token = await getInstallationToken(Number(installation.installation_id), Number(installation.repo_id));
  logger.setRedactionContext({ GITHUB_INSTALLATION_TOKEN: token });

  return {
    cloneUrl: buildCredentialFreeCloneUrl(installation.repo_full_name),
    askpassPath: ensureGitAskpassScript(),
    token,
  };
}
