import { NextRequest, NextResponse } from 'next/server';
import { requireGithubAppConfig } from '~/services/githubApp';
import { verifyGithubSignature, validatePushPayload, validatePullRequestPayload } from '~/lib/githubWebhook';
import { enqueueGithubPushEvent, enqueueGithubPullRequestEvent } from '~/services/deployQueue';
import logger from '~/services/logger';

// Must run in the Node runtime (not edge): requireGithubAppConfig() decrypts secrets via
// Node's `crypto`, and this route needs Node's `crypto.timingSafeEqual` for signature
// verification (see ~/lib/githubWebhook.ts).
export const runtime = 'nodejs';

// GitHub's push payload can legitimately run to a few hundred KB for a large multi-commit
// push, but is never anywhere near this - a hard cap bounds memory use per request without
// touching any realistic delivery. Documented in docs/SOW-github-autodeploy.md.
const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB

/**
 * Reads a request body up to `maxBytes`, aborting the underlying stream as soon as that's
 * exceeded rather than buffering the whole thing first. This route has no session auth
 * (see middleware.ts's exception for it), so an unauthenticated caller could otherwise send
 * an arbitrarily large body with no (or a lying) Content-Length header and force this
 * process to buffer all of it via a single `request.arrayBuffer()` call before the size
 * was ever checked - the Content-Length check earlier in POST() is only a fast rejection
 * for the common case where the header is present and honest; this is what actually
 * bounds memory regardless of what Content-Length claims or omits.
 */
async function readBodyWithLimit(request: NextRequest, maxBytes: number): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) {
    return Buffer.alloc(0);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

/**
 * GitHub docs: "Validating webhook deliveries" and "Handling webhook deliveries".
 *
 * This route ONLY validates the delivery and durably enqueues a queue row per eligible app
 * (see deployQueue.ts's enqueueGithubPushEvent / enqueueGithubPullRequestEvent) - it never
 * calls the GitHub API, never touches git/clone/build, never provisions or tears down
 * preview infrastructure, never creates a `deployments` row, and never mutates the
 * logger's deployment context. All of that stays exactly where it already lived: inside
 * the single queue worker (deployQueue.ts's runJob -> deploymentExecutor.ts /
 * deletePreviewBranch), which this route only kicks AFTER its own transaction commits
 * (never before, and never synchronously waiting for it to run).
 *
 * The middleware.ts session-auth allowlist has a narrow exception for exactly this
 * pathname and POST - every other GitHub route (config, connect, discover, the install
 * callback) stays behind normal session auth.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
  }

  // Read the raw bytes exactly once, before any parsing - the signature below is computed
  // over these exact bytes, not over a re-serialized JSON.parse() round-trip of them. The
  // limit is enforced WHILE reading (readBodyWithLimit cancels the stream as soon as it's
  // exceeded), not only after the fact - see that function's own comment.
  const rawBody = await readBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
  if (rawBody === null) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let webhookSecret: string;
  try {
    webhookSecret = (await requireGithubAppConfig()).webhookSecret;
  } catch (error) {
    // Configuration failure, not a delivery problem - never treat this as an accepted
    // delivery. Logged (never with the secret itself - requireGithubAppConfig's own
    // errors don't carry it) so a decrypt/config failure is actually diagnosable instead
    // of surfacing only as a generic 500 with nothing in the server logs.
    await logger.error('Failed to resolve GitHub App config for webhook delivery', error as Error);
    return NextResponse.json({ error: 'GitHub App is not configured' }, { status: 500 });
  }

  const signatureHeader = request.headers.get('x-hub-signature-256');
  if (!verifyGithubSignature(rawBody, signatureHeader, webhookSecret)) {
    // Deliberately generic - never echoes the signature header or any part of the secret.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const deliveryId = request.headers.get('x-github-delivery');
  if (!deliveryId) {
    return NextResponse.json({ error: 'Missing X-GitHub-Delivery header' }, { status: 400 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') {
    return NextResponse.json({ ok: true, event: 'ping' }, { status: 200 });
  }
  if (event !== 'push' && event !== 'pull_request') {
    return NextResponse.json({ ok: true, ignored: true, reason: 'unsupported_event' }, { status: 200 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  try {
    if (event === 'pull_request') {
      return await handlePullRequestEvent(body, deliveryId);
    }
    return await handlePushEvent(body, deliveryId);
  } catch (error) {
    await logger.error(
      event === 'pull_request' ? 'Failed to enqueue GitHub pull_request event' : 'Failed to enqueue GitHub push event',
      error as Error
    );
    return NextResponse.json({ error: 'Failed to record webhook event' }, { status: 500 });
  }
}

async function handlePushEvent(body: unknown, deliveryId: string): Promise<NextResponse> {
  const validation = validatePushPayload(body);
  if (!validation.ok) {
    if (validation.reason === 'malformed') {
      return NextResponse.json({ error: 'Malformed push payload' }, { status: 400 });
    }
    // not_branch_ref (tag push), deleted (branch deletion), or zero_sha - all expected,
    // ignorable inputs, acknowledged successfully without deploying or deleting anything.
    return NextResponse.json({ ok: true, ignored: true, reason: validation.reason }, { status: 200 });
  }

  const { branch, sha, installationId, repoId } = validation.payload;
  const result = await enqueueGithubPushEvent({ installationId, repoId, branch, sha, deliveryId });

  if (result.insertedJobIds.length > 0) {
    await logger.info('GitHub push enqueued', {
      deliveryId,
      installationId,
      repoId,
      branch,
      queued: result.insertedJobIds.length,
    });
    // 202: new work was durably accepted - this is strictly after the enqueue
    // transaction committed, and the deployment itself has not run yet.
    return NextResponse.json({ accepted: true, queued: result.insertedJobIds.length }, { status: 202 });
  }

  if (result.ignoredReason) {
    return NextResponse.json({ ok: true, ignored: true, reason: result.ignoredReason }, { status: 200 });
  }

  return NextResponse.json(
    {
      accepted: false,
      queued: 0,
      reason: result.eligibleAppIds.length === 0 ? 'no_eligible_apps' : 'duplicate_delivery',
    },
    { status: 200 }
  );
}

async function handlePullRequestEvent(body: unknown, deliveryId: string): Promise<NextResponse> {
  const validation = validatePullRequestPayload(body);
  if (!validation.ok) {
    if (validation.reason === 'malformed') {
      return NextResponse.json({ error: 'Malformed pull_request payload' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ignored: true, reason: validation.reason }, { status: 200 });
  }

  const { kind, prNumber, branch, sha, installationId, repoId } = validation.payload;
  const result = await enqueueGithubPullRequestEvent({
    installationId,
    repoId,
    branch,
    sha,
    deliveryId,
    prNumber,
    kind,
  });

  if (result.insertedJobIds.length > 0) {
    await logger.info('GitHub pull_request enqueued', {
      deliveryId,
      installationId,
      repoId,
      branch,
      prNumber,
      kind,
      queued: result.insertedJobIds.length,
    });
    return NextResponse.json({ accepted: true, queued: result.insertedJobIds.length }, { status: 202 });
  }

  return NextResponse.json(
    {
      accepted: false,
      queued: 0,
      reason: result.eligibleAppIds.length === 0 ? 'no_eligible_apps' : 'duplicate_delivery',
    },
    { status: 200 }
  );
}
