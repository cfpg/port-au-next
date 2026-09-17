import { createHmac, timingSafeEqual } from 'crypto';

/**
 * GitHub docs: "Validating webhook deliveries" - HMAC-SHA256 over the exact raw request
 * body bytes, keyed with the configured webhook secret, compared with a timing-safe
 * comparison so response-time doesn't leak how many leading bytes matched. Operates on the
 * raw Buffer (not a decoded/re-encoded string) so this is exact regardless of encoding.
 */
export function verifyGithubSignature(
  rawBody: Buffer,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`, 'utf8');
  const actual = Buffer.from(signatureHeader, 'utf8');

  // timingSafeEqual throws on a length mismatch rather than returning false - a genuine
  // signature is always the same length, so a different length is already a mismatch and
  // safe to reject directly without feeding it to timingSafeEqual.
  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

export const GITHUB_ZERO_SHA = '0'.repeat(40);
const COMMIT_SHA_REGEX = /^[0-9a-f]{40}$/i;

export function isValidCommitSha(value: unknown): value is string {
  return typeof value === 'string' && COMMIT_SHA_REGEX.test(value);
}

const BRANCH_REF_PREFIX = 'refs/heads/';

/**
 * A branch name safe to hand to git as a positional argument later (a leading `-` risks
 * being parsed as an option by `git fetch`/`checkout`/`reset` even though every call site
 * uses an argv array, not a shell string - see git.ts). A real GitHub branch name is never
 * empty and never starts with `-` (GitHub itself enforces `git check-ref-format`).
 */
export function isSafeGitBranchName(branch: unknown): branch is string {
  return typeof branch === 'string' && branch.length > 0 && !branch.startsWith('-');
}

/**
 * Extracts the branch name from a push event's `ref`, or null if it isn't a branch ref
 * (e.g. a tag push, `refs/tags/...`) or the branch name itself would be unsafe to hand to
 * git as a positional argument later. This rejects only inputs that could not have come
 * from a genuine push.
 */
export function parsePushBranchRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(BRANCH_REF_PREFIX)) {
    return null;
  }
  const branch = ref.slice(BRANCH_REF_PREFIX.length);
  if (!isSafeGitBranchName(branch)) {
    return null;
  }
  return branch;
}

export interface ValidatedPushPayload {
  branch: string;
  sha: string;
  installationId: number;
  repoId: number;
}

export type PushPayloadValidationResult =
  | { ok: true; payload: ValidatedPushPayload }
  | { ok: false; reason: 'not_branch_ref' | 'deleted' | 'zero_sha' | 'malformed' };

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Structural validation of a GitHub `push` webhook payload. Deliberately doesn't trust a
 * TypeScript interface to have validated anything - the parsed JSON came straight from
 * network input, and a valid HMAC signature only proves who sent the bytes, not that the
 * bytes have the shape a `push` event is documented to have.
 *
 * `not_branch_ref`, `deleted`, and `zero_sha` are all expected, ignorable inputs (a tag
 * push, a branch deletion, or the all-zero SHA GitHub sometimes sends alongside a deletion)
 * - callers should acknowledge these successfully without deploying or deleting anything,
 * not treat them as errors. Only `malformed` (a field present but not the type/shape a real
 * push event would have) indicates the payload itself is suspect.
 */
export function validatePushPayload(body: unknown): PushPayloadValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const record = body as Record<string, unknown>;

  const branch = parsePushBranchRef(record.ref);
  if (branch === null) {
    return { ok: false, reason: 'not_branch_ref' };
  }

  if (record.deleted === true) {
    return { ok: false, reason: 'deleted' };
  }

  const after = record.after;
  if (!isValidCommitSha(after)) {
    return { ok: false, reason: 'malformed' };
  }
  if (after.toLowerCase() === GITHUB_ZERO_SHA) {
    return { ok: false, reason: 'zero_sha' };
  }

  const installation = record.installation;
  const installationId =
    installation && typeof installation === 'object' ? (installation as Record<string, unknown>).id : undefined;
  if (!isPositiveInteger(installationId)) {
    return { ok: false, reason: 'malformed' };
  }

  const repository = record.repository;
  const repoId =
    repository && typeof repository === 'object' ? (repository as Record<string, unknown>).id : undefined;
  if (!isPositiveInteger(repoId)) {
    return { ok: false, reason: 'malformed' };
  }

  return {
    ok: true,
    payload: { branch, sha: after, installationId, repoId },
  };
}

export const PULL_REQUEST_DEPLOY_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);
export const PULL_REQUEST_TEARDOWN_ACTIONS = new Set(['closed']);

export type PullRequestJobKind = 'deploy' | 'teardown';

export interface ValidatedPullRequestPayload {
  kind: PullRequestJobKind;
  action: string;
  prNumber: number;
  branch: string;
  sha: string;
  installationId: number;
  repoId: number;
}

export type PullRequestPayloadValidationResult =
  | { ok: true; payload: ValidatedPullRequestPayload }
  | { ok: false; reason: 'ignored_action' | 'fork' | 'malformed' };

/**
 * Structural validation of a GitHub `pull_request` webhook payload. Same untrusted-JSON
 * stance as validatePushPayload: a valid HMAC only proves who sent the bytes.
 *
 * `ignored_action` (labeled, assigned, edited, …) and `fork` (head repo is not the
 * installed repository) are expected, ignorable inputs - callers should acknowledge them
 * successfully without deploying or tearing anything down. Only `malformed` indicates the
 * payload itself is suspect. Ignored actions are classified BEFORE the rest of the shape
 * is required, so a `labeled` delivery missing `head.sha` is not a 400 that GitHub would
 * retry.
 */
export function validatePullRequestPayload(body: unknown): PullRequestPayloadValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const record = body as Record<string, unknown>;

  if (typeof record.action !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  const kind: PullRequestJobKind | null = PULL_REQUEST_DEPLOY_ACTIONS.has(record.action)
    ? 'deploy'
    : PULL_REQUEST_TEARDOWN_ACTIONS.has(record.action)
      ? 'teardown'
      : null;
  if (kind === null) {
    return { ok: false, reason: 'ignored_action' };
  }

  const installation = record.installation;
  const installationId =
    installation && typeof installation === 'object' ? (installation as Record<string, unknown>).id : undefined;
  if (!isPositiveInteger(installationId)) {
    return { ok: false, reason: 'malformed' };
  }

  const repository = record.repository;
  const repoId =
    repository && typeof repository === 'object' ? (repository as Record<string, unknown>).id : undefined;
  if (!isPositiveInteger(repoId)) {
    return { ok: false, reason: 'malformed' };
  }

  const pullRequest = record.pull_request;
  if (!pullRequest || typeof pullRequest !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const pr = pullRequest as Record<string, unknown>;
  if (!isPositiveInteger(pr.number)) {
    return { ok: false, reason: 'malformed' };
  }

  const head = pr.head;
  if (!head || typeof head !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  const headRecord = head as Record<string, unknown>;
  if (!isSafeGitBranchName(headRecord.ref)) {
    return { ok: false, reason: 'malformed' };
  }
  if (!isValidCommitSha(headRecord.sha) || headRecord.sha.toLowerCase() === GITHUB_ZERO_SHA) {
    return { ok: false, reason: 'malformed' };
  }

  const headRepo = headRecord.repo;
  const headRepoId =
    headRepo && typeof headRepo === 'object' ? (headRepo as Record<string, unknown>).id : undefined;
  if (!isPositiveInteger(headRepoId) || headRepoId !== repoId) {
    return { ok: false, reason: 'fork' };
  }

  return {
    ok: true,
    payload: {
      kind,
      action: record.action,
      prNumber: pr.number,
      branch: headRecord.ref,
      sha: headRecord.sha,
      installationId,
      repoId,
    },
  };
}
