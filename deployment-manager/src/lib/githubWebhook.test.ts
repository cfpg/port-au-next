import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  verifyGithubSignature,
  validatePushPayload,
  validatePullRequestPayload,
  parsePushBranchRef,
  isSafeGitBranchName,
  isValidCommitSha,
  GITHUB_ZERO_SHA,
} from './githubWebhook';

const SECRET = 'test-webhook-secret';

function signatureFor(body: string, secret: string = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex')}`;
}

describe('verifyGithubSignature', () => {
  it('accepts a signature computed correctly over the exact raw body', () => {
    const body = '{"ref":"refs/heads/main"}';
    const signature = signatureFor(body);

    expect(verifyGithubSignature(Buffer.from(body, 'utf8'), signature, SECRET)).toBe(true);
  });

  it('accepts a body containing multi-byte unicode characters', () => {
    const body = JSON.stringify({ ref: 'refs/heads/main', pusher: { name: '日本語テスト 🚀' } });
    const signature = signatureFor(body);

    expect(verifyGithubSignature(Buffer.from(body, 'utf8'), signature, SECRET)).toBe(true);
  });

  it('rejects when the body changes after the signature was computed', () => {
    const original = '{"ref":"refs/heads/main"}';
    const signature = signatureFor(original);
    const tampered = '{"ref":"refs/heads/malicious"}';

    expect(verifyGithubSignature(Buffer.from(tampered, 'utf8'), signature, SECRET)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const body = '{"ref":"refs/heads/main"}';
    const signature = signatureFor(body, 'a-different-secret');

    expect(verifyGithubSignature(Buffer.from(body, 'utf8'), signature, SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyGithubSignature(Buffer.from('{}', 'utf8'), null, SECRET)).toBe(false);
    expect(verifyGithubSignature(Buffer.from('{}', 'utf8'), undefined, SECRET)).toBe(false);
  });

  it('rejects a malformed signature header without the sha256= prefix', () => {
    const body = '{"ref":"refs/heads/main"}';
    const rawHex = createHmac('sha256', SECRET).update(body).digest('hex');

    expect(verifyGithubSignature(Buffer.from(body, 'utf8'), rawHex, SECRET)).toBe(false);
    expect(verifyGithubSignature(Buffer.from(body, 'utf8'), `sha1=${rawHex}`, SECRET)).toBe(false);
  });

  it('rejects a signature of a different length without throwing', () => {
    expect(verifyGithubSignature(Buffer.from('{}', 'utf8'), 'sha256=deadbeef', SECRET)).toBe(false);
  });
});

describe('parsePushBranchRef', () => {
  it('extracts the branch name from a heads ref', () => {
    expect(parsePushBranchRef('refs/heads/main')).toBe('main');
    expect(parsePushBranchRef('refs/heads/feature/foo')).toBe('feature/foo');
  });

  it('rejects a tag ref', () => {
    expect(parsePushBranchRef('refs/tags/v1.0.0')).toBeNull();
  });

  it('rejects a non-string ref', () => {
    expect(parsePushBranchRef(123)).toBeNull();
    expect(parsePushBranchRef(undefined)).toBeNull();
  });

  it('rejects an empty branch name', () => {
    expect(parsePushBranchRef('refs/heads/')).toBeNull();
  });

  it('rejects a branch name that could be parsed as a git option (leading -)', () => {
    expect(parsePushBranchRef('refs/heads/--upload-pack=evil')).toBeNull();
  });
});

describe('isValidCommitSha', () => {
  it('accepts a 40-character hex SHA in either case', () => {
    expect(isValidCommitSha('a'.repeat(40))).toBe(true);
    expect(isValidCommitSha('A1B2'.repeat(10))).toBe(true);
  });

  it('rejects wrong-length or non-hex values, and non-strings', () => {
    expect(isValidCommitSha('a'.repeat(39))).toBe(false);
    expect(isValidCommitSha('a'.repeat(41))).toBe(false);
    expect(isValidCommitSha('z'.repeat(40))).toBe(false);
    expect(isValidCommitSha(1234)).toBe(false);
    expect(isValidCommitSha(null)).toBe(false);
  });
});

const validPush = {
  ref: 'refs/heads/main',
  after: 'a'.repeat(40),
  deleted: false,
  installation: { id: 555 },
  repository: { id: 42, full_name: 'example/demo' },
};

describe('validatePushPayload', () => {
  it('accepts a well-formed push payload', () => {
    const result = validatePushPayload(validPush);
    expect(result).toEqual({
      ok: true,
      payload: { branch: 'main', sha: 'a'.repeat(40), installationId: 555, repoId: 42 },
    });
  });

  it('flags a tag push as not_branch_ref', () => {
    const result = validatePushPayload({ ...validPush, ref: 'refs/tags/v1.0.0' });
    expect(result).toEqual({ ok: false, reason: 'not_branch_ref' });
  });

  it('flags a branch deletion as deleted', () => {
    const result = validatePushPayload({ ...validPush, deleted: true });
    expect(result).toEqual({ ok: false, reason: 'deleted' });
  });

  it('flags the all-zero SHA as zero_sha', () => {
    const result = validatePushPayload({ ...validPush, after: GITHUB_ZERO_SHA });
    expect(result).toEqual({ ok: false, reason: 'zero_sha' });
  });

  it('flags a non-object body as malformed', () => {
    expect(validatePushPayload(null)).toEqual({ ok: false, reason: 'malformed' });
    expect(validatePushPayload('not an object')).toEqual({ ok: false, reason: 'malformed' });
    expect(validatePushPayload(undefined)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('flags a non-SHA `after` value as malformed rather than treating it as a real commit', () => {
    expect(validatePushPayload({ ...validPush, after: 'not-a-sha' })).toEqual({ ok: false, reason: 'malformed' });
    expect(validatePushPayload({ ...validPush, after: 12345 })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('flags a missing or non-numeric installation id as malformed - does not trust the TS shape', () => {
    expect(validatePushPayload({ ...validPush, installation: {} })).toEqual({ ok: false, reason: 'malformed' });
    expect(validatePushPayload({ ...validPush, installation: { id: '555' } })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(validatePushPayload({ ...validPush, installation: undefined })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(validatePushPayload({ ...validPush, installation: { id: -1 } })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('flags a missing or non-numeric repository id as malformed', () => {
    expect(validatePushPayload({ ...validPush, repository: { full_name: 'example/demo' } })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(validatePushPayload({ ...validPush, repository: { id: '42' } })).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('isSafeGitBranchName', () => {
  it('accepts a normal branch name', () => {
    expect(isSafeGitBranchName('main')).toBe(true);
    expect(isSafeGitBranchName('feature/foo')).toBe(true);
  });

  it('rejects empty, non-string, or leading-dash names', () => {
    expect(isSafeGitBranchName('')).toBe(false);
    expect(isSafeGitBranchName('--upload-pack=evil')).toBe(false);
    expect(isSafeGitBranchName(12)).toBe(false);
    expect(isSafeGitBranchName(undefined)).toBe(false);
  });
});

const validPullRequest = {
  action: 'opened',
  number: 12,
  installation: { id: 555 },
  repository: { id: 42, full_name: 'example/demo' },
  pull_request: {
    number: 12,
    head: {
      ref: 'feature/foo',
      sha: 'b'.repeat(40),
      repo: { id: 42 },
    },
  },
};

describe('validatePullRequestPayload', () => {
  it('accepts opened, synchronize, and reopened as deploy', () => {
    for (const action of ['opened', 'synchronize', 'reopened']) {
      const result = validatePullRequestPayload({ ...validPullRequest, action });
      expect(result).toEqual({
        ok: true,
        payload: {
          kind: 'deploy',
          action,
          prNumber: 12,
          branch: 'feature/foo',
          sha: 'b'.repeat(40),
          installationId: 555,
          repoId: 42,
        },
      });
    }
  });

  it('accepts closed as teardown', () => {
    const result = validatePullRequestPayload({ ...validPullRequest, action: 'closed' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.kind).toBe('teardown');
    }
  });

  it('flags labeled/edited/assigned as ignored_action before requiring the rest of the shape', () => {
    expect(validatePullRequestPayload({ action: 'labeled' })).toEqual({ ok: false, reason: 'ignored_action' });
    expect(validatePullRequestPayload({ action: 'edited' })).toEqual({ ok: false, reason: 'ignored_action' });
    expect(validatePullRequestPayload({ action: 'assigned' })).toEqual({ ok: false, reason: 'ignored_action' });
    expect(validatePullRequestPayload({ action: 'ready_for_review' })).toEqual({
      ok: false,
      reason: 'ignored_action',
    });
  });

  it('flags a fork (head.repo.id !== repository.id) as fork, including a missing head repo', () => {
    const forked = {
      ...validPullRequest,
      pull_request: {
        ...validPullRequest.pull_request,
        head: { ...validPullRequest.pull_request.head, repo: { id: 99 } },
      },
    };
    expect(validatePullRequestPayload(forked)).toEqual({ ok: false, reason: 'fork' });

    const deletedFork = {
      ...validPullRequest,
      pull_request: {
        ...validPullRequest.pull_request,
        head: { ...validPullRequest.pull_request.head, repo: null },
      },
    };
    expect(validatePullRequestPayload(deletedFork)).toEqual({ ok: false, reason: 'fork' });
  });

  it('flags a leading-dash head ref as malformed', () => {
    const payload = {
      ...validPullRequest,
      pull_request: {
        ...validPullRequest.pull_request,
        head: { ...validPullRequest.pull_request.head, ref: '--upload-pack=evil' },
      },
    };
    expect(validatePullRequestPayload(payload)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('flags a missing or non-numeric installation/repository/number as malformed', () => {
    expect(validatePullRequestPayload({ ...validPullRequest, installation: {} })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(validatePullRequestPayload({ ...validPullRequest, pull_request: { head: validPullRequest.pull_request.head } })).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(validatePullRequestPayload(null)).toEqual({ ok: false, reason: 'malformed' });
    expect(validatePullRequestPayload({ action: 12 })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('flags a zero or non-SHA head.sha as malformed', () => {
    const zeroSha = {
      ...validPullRequest,
      pull_request: {
        ...validPullRequest.pull_request,
        head: { ...validPullRequest.pull_request.head, sha: GITHUB_ZERO_SHA },
      },
    };
    expect(validatePullRequestPayload(zeroSha)).toEqual({ ok: false, reason: 'malformed' });
  });
});
