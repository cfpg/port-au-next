import logger from '~/services/logger';
import { GitAuthEnv } from '~/services/git';
import { findGithubInstallationForApp } from '~/queries/githubInstallationsQuery';
import { getInstallationToken, ensureGitAskpassScript } from '~/services/githubApp';
import { buildCredentialFreeCloneUrl } from '~/utils/githubRepoMatch';
import { App } from '~/types';

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
 */
export async function resolveGitAuth(app: App): Promise<GitAuthEnv | undefined> {
  const installation = await findGithubInstallationForApp(app.id);
  if (!installation) {
    return undefined;
  }

  const token = await getInstallationToken(Number(installation.installation_id), Number(installation.repo_id));
  logger.setRedactionContext({ GITHUB_INSTALLATION_TOKEN: token });

  return {
    cloneUrl: buildCredentialFreeCloneUrl(installation.repo_full_name),
    askpassPath: ensureGitAskpassScript(),
    token,
  };
}
