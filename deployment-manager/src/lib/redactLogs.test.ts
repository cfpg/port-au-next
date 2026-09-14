import { describe, it, expect, beforeEach, vi } from 'vitest';
import { redactLogText, clearActiveRedactionSecrets } from './redactLogs';

vi.mock('~/services/database', () => ({ default: { query: vi.fn() } }));

import logger from '~/services/logger';

describe('redaction is additive across multiple registrations', () => {
  beforeEach(() => {
    clearActiveRedactionSecrets();
  });

  it('keeps an earlier registered secret redacted after a second, unrelated registration', () => {
    // Simulates the real sequence: a git credential is registered (resolveGitAuth), then
    // releasePipeline separately registers the app's own env values - the second call
    // must not blow away the first (the bug this additive design specifically fixes).
    logger.setRedactionContext({ GITHUB_INSTALLATION_TOKEN: 'ghs_supersecrettoken1234' });
    logger.setRedactionContext({ DATABASE_PASSWORD: 'db-pass-xyz' });

    const message = 'fetch failed using ghs_supersecrettoken1234 against db-pass-xyz';
    const redacted = redactLogText(message);

    expect(redacted).not.toContain('ghs_supersecrettoken1234');
    expect(redacted).not.toContain('db-pass-xyz');
  });

  it('redacts a raw subprocess error message containing a live token (git fetch failure)', () => {
    // Represents an execFile rejection's .message ending up in a log/queue error field -
    // not something that only flows through logger.info/error's own arguments.
    logger.setRedactionContext({ GITHUB_INSTALLATION_TOKEN: 'ghs_supersecrettoken1234' });

    const subprocessError = new Error(
      "Command failed: git -C /apps/demo fetch origin main\nfatal: could not read Username " +
        "for 'https://x-access-token:ghs_supersecrettoken1234@github.com': terminal prompts disabled"
    );

    expect(redactLogText(subprocessError.message)).not.toContain('ghs_supersecrettoken1234');
  });

  it('clears all registered secrets on clearDeploymentContext, matching one job\'s lifecycle', () => {
    logger.setRedactionContext({ GITHUB_INSTALLATION_TOKEN: 'ghs_supersecrettoken1234' });
    expect(redactLogText('token: ghs_supersecrettoken1234')).not.toContain('ghs_supersecrettoken1234');

    logger.clearDeploymentContext();

    expect(redactLogText('token: ghs_supersecrettoken1234')).toContain('ghs_supersecrettoken1234');
  });
});
