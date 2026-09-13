import { normalizeGithubRepoFullName } from '~/utils/githubRepoMatch';
import { GithubRepoSummary } from '~/services/githubApp';

export interface ConnectFlowInputs {
  consumedState: { app_id: number; user_id: string } | null;
  sessionUserId: string | undefined;
  app: { id: number; name: string; repo_url: string } | null;
  installationInfo: { accountLogin: string; appId: number } | null;
  accessibleRepos: GithubRepoSummary[];
}

export type ConnectFlowResult =
  | { ok: true; appName: string; repo: GithubRepoSummary; accountLogin: string }
  | { ok: false; reason: 'expired_or_replayed' | 'app_not_found' | 'wrong_user' | 'wrong_app' | 'invalid_repo_url' | 'repo_not_accessible'; appName?: string };

/**
 * Pure decision logic for the "Connect GitHub" callback - kept separate from the route
 * handler (which just gathers these inputs from the DB/session/GitHub API and translates
 * the result into a redirect) so the four rejection scenarios and the success path are
 * each testable without mocking Next.js request/session plumbing.
 */
export function resolveGithubConnectOutcome(inputs: ConnectFlowInputs): ConnectFlowResult {
  if (!inputs.consumedState) {
    // Covers both an expired token and a replayed (already-used) one - consumeConnectState
    // deliberately doesn't distinguish the two to the caller.
    return { ok: false, reason: 'expired_or_replayed' };
  }

  if (!inputs.app) {
    return { ok: false, reason: 'app_not_found' };
  }

  if (!inputs.sessionUserId || inputs.sessionUserId !== inputs.consumedState.user_id) {
    return { ok: false, reason: 'wrong_user', appName: inputs.app.name };
  }

  if (!inputs.installationInfo) {
    return { ok: false, reason: 'wrong_app', appName: inputs.app.name };
  }

  const targetRepoFullName = normalizeGithubRepoFullName(inputs.app.repo_url);
  if (!targetRepoFullName) {
    return { ok: false, reason: 'invalid_repo_url', appName: inputs.app.name };
  }

  const matched = inputs.accessibleRepos.find(
    (repo) => repo.fullName.toLowerCase() === targetRepoFullName
  );
  if (!matched) {
    return { ok: false, reason: 'repo_not_accessible', appName: inputs.app.name };
  }

  return { ok: true, appName: inputs.app.name, repo: matched, accountLogin: inputs.installationInfo.accountLogin };
}
