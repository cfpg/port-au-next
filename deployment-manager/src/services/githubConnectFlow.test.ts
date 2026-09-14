import { describe, it, expect } from 'vitest';
import { resolveGithubConnectOutcome } from './githubConnectFlow';

const baseApp = { id: 1, name: 'demo', repo_url: 'https://github.com/example/demo.git' };
const baseInstallationInfo = { accountLogin: 'example', appId: 999 };
const matchingRepo = { id: 42, fullName: 'example/demo' };

describe('resolveGithubConnectOutcome', () => {
  it('rejects an expired or replayed state token', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: null, // consumeConnectState() found no valid, unused, unexpired row
      sessionUserId: 'user-1',
      app: baseApp,
      installationInfo: baseInstallationInfo,
      accessibleRepos: [matchingRepo],
    });

    expect(result).toEqual({ ok: false, reason: 'expired_or_replayed' });
  });

  it('rejects when the app the state was minted for no longer exists', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-1' },
      sessionUserId: 'user-1',
      app: null,
      installationInfo: baseInstallationInfo,
      accessibleRepos: [matchingRepo],
    });

    expect(result).toEqual({ ok: false, reason: 'app_not_found' });
  });

  it('rejects when the browser completing the flow is not the one that started it (wrong user)', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-who-started-it' },
      sessionUserId: 'a-different-user',
      app: baseApp,
      installationInfo: baseInstallationInfo,
      accessibleRepos: [matchingRepo],
    });

    expect(result).toEqual({ ok: false, reason: 'wrong_user', appName: 'demo' });
  });

  it('rejects when there is no session user at all', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-1' },
      sessionUserId: undefined,
      app: baseApp,
      installationInfo: baseInstallationInfo,
      accessibleRepos: [matchingRepo],
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe('wrong_user');
  });

  it('rejects an installation that does not belong to this platform\'s GitHub App (wrong app)', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-1' },
      sessionUserId: 'user-1',
      app: baseApp,
      installationInfo: null, // verifyInstallationBelongsToApp() got a 404 from GitHub
      accessibleRepos: [matchingRepo],
    });

    expect(result).toEqual({ ok: false, reason: 'wrong_app', appName: 'demo' });
  });

  it('rejects when the app repo_url is not a github.com URL at all', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-1' },
      sessionUserId: 'user-1',
      app: { ...baseApp, repo_url: 'https://gitlab.com/example/demo.git' },
      installationInfo: baseInstallationInfo,
      accessibleRepos: [matchingRepo],
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_repo_url', appName: 'demo' });
  });

  it('rejects when the installation does not have access to this app\'s specific repository', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-1' },
      sessionUserId: 'user-1',
      app: baseApp,
      installationInfo: baseInstallationInfo,
      accessibleRepos: [{ id: 7, fullName: 'example/some-other-repo' }],
    });

    expect(result).toEqual({ ok: false, reason: 'repo_not_accessible', appName: 'demo' });
  });

  it('does not silently connect to a different repo than the one the app is configured for', () => {
    // Same owner, different repo name - must not match.
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-1' },
      sessionUserId: 'user-1',
      app: baseApp,
      installationInfo: baseInstallationInfo,
      accessibleRepos: [{ id: 7, fullName: 'example/demo-staging' }],
    });

    expect(result.ok).toBe(false);
  });

  it('accepts when everything lines up, matching by repo full name case-insensitively', () => {
    const result = resolveGithubConnectOutcome({
      consumedState: { app_id: 1, user_id: 'user-1' },
      sessionUserId: 'user-1',
      app: baseApp,
      installationInfo: baseInstallationInfo,
      accessibleRepos: [{ id: 42, fullName: 'Example/Demo' }],
    });

    expect(result).toEqual({
      ok: true,
      appName: 'demo',
      repo: { id: 42, fullName: 'Example/Demo' },
      accountLogin: 'example',
    });
  });
});
