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
 * Extracts the branch name from a push event's `ref`, or null if it isn't a branch ref
 * (e.g. a tag push, `refs/tags/...`) or the branch name itself would be unsafe to hand to
 * git as a positional argument later (a leading `-` risks being parsed as an option by
 * `git fetch`/`checkout`/`reset` even though every call site uses an argv array, not a
 * shell string - see git.ts). A real GitHub branch name is never empty and never starts
 * with `-` (GitHub itself enforces `git check-ref-format` on the branch that was pushed),
 * so this rejects only inputs that could not have come from a genuine push.
 */
export function parsePushBranchRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(BRANCH_REF_PREFIX)) {
    return null;
  }
  const branch = ref.slice(BRANCH_REF_PREFIX.length);
  if (!branch || branch.startsWith('-')) {
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
