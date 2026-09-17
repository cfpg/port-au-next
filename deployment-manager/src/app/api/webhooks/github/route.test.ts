import { createHmac } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { requireGithubAppConfigMock, enqueueGithubPushEventMock, enqueueGithubPullRequestEventMock, loggerErrorMock } = vi.hoisted(() => ({
  requireGithubAppConfigMock: vi.fn(),
  enqueueGithubPushEventMock: vi.fn(),
  enqueueGithubPullRequestEventMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('~/services/githubApp', () => ({
  requireGithubAppConfig: requireGithubAppConfigMock,
}));
vi.mock('~/services/deployQueue', () => ({
  enqueueGithubPushEvent: enqueueGithubPushEventMock,
  enqueueGithubPullRequestEvent: enqueueGithubPullRequestEventMock,
}));
vi.mock('~/services/logger', () => ({
  default: { info: vi.fn(), error: loggerErrorMock },
}));

import { POST } from './route';

const SECRET = 'test-webhook-secret';

function signatureFor(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(Buffer.from(body, 'utf8')).digest('hex')}`;
}

function makeRequest(
  body: string,
  headers: Record<string, string> = {},
  { includeSignature = true, includeDelivery = true, event = 'push' }: Partial<{
    includeSignature: boolean;
    includeDelivery: boolean;
    event: string | null;
  }> = {}
): NextRequest {
  const finalHeaders: Record<string, string> = { ...headers };
  if (includeSignature && finalHeaders['x-hub-signature-256'] === undefined) {
    finalHeaders['x-hub-signature-256'] = signatureFor(body);
  }
  if (includeDelivery && finalHeaders['x-github-delivery'] === undefined) {
    finalHeaders['x-github-delivery'] = 'delivery-1';
  }
  if (event !== null && finalHeaders['x-github-event'] === undefined) {
    finalHeaders['x-github-event'] = event;
  }
  return new NextRequest('https://example.com/api/webhooks/github', {
    method: 'POST',
    headers: finalHeaders,
    body,
  });
}

const validPushBody = JSON.stringify({
  ref: 'refs/heads/main',
  after: 'a'.repeat(40),
  deleted: false,
  installation: { id: 555 },
  repository: { id: 42, full_name: 'example/demo' },
});

beforeEach(() => {
  requireGithubAppConfigMock.mockReset();
  enqueueGithubPushEventMock.mockReset();
  enqueueGithubPullRequestEventMock.mockReset();
  loggerErrorMock.mockReset();
  requireGithubAppConfigMock.mockResolvedValue({
    appId: '1',
    privateKeyPem: 'unused',
    webhookSecret: SECRET,
    appSlug: 'demo',
    clientId: null,
  });
});

describe('POST /api/webhooks/github', () => {
  it('enqueues a valid signed push and responds 202 only with newly accepted work', async () => {
    enqueueGithubPushEventMock.mockResolvedValue({ eligibleAppIds: [1], insertedJobIds: [10] });

    const response = await POST(makeRequest(validPushBody));

    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: true, queued: 1 });
    expect(enqueueGithubPushEventMock).toHaveBeenCalledWith({
      installationId: 555,
      repoId: 42,
      branch: 'main',
      sha: 'a'.repeat(40),
      deliveryId: 'delivery-1',
    });
  });

  it('responds 200 (not 202) when the delivery is a duplicate of an already-recorded one', async () => {
    enqueueGithubPushEventMock.mockResolvedValue({ eligibleAppIds: [1], insertedJobIds: [] });

    const response = await POST(makeRequest(validPushBody));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: false, queued: 0, reason: 'duplicate_delivery' });
  });

  it('responds 200 with no_eligible_apps when nothing is connected/enabled for this installation+repo', async () => {
    enqueueGithubPushEventMock.mockResolvedValue({ eligibleAppIds: [], insertedJobIds: [] });

    const response = await POST(makeRequest(validPushBody));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: false, queued: 0, reason: 'no_eligible_apps' });
  });

  it('acknowledges a signed ping event without enqueueing anything', async () => {
    const response = await POST(makeRequest('{}', {}, { event: 'ping' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, event: 'ping' });
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('acknowledges and ignores a signed non-push event', async () => {
    const response = await POST(makeRequest('{}', {}, { event: 'issues' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true, reason: 'unsupported_event' });
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('acknowledges and ignores a tag push, a branch deletion, and the zero SHA without enqueueing', async () => {
    const tagPush = JSON.stringify({ ...JSON.parse(validPushBody), ref: 'refs/tags/v1.0.0' });
    const deletion = JSON.stringify({ ...JSON.parse(validPushBody), deleted: true });
    const zeroSha = JSON.stringify({ ...JSON.parse(validPushBody), after: '0'.repeat(40) });

    for (const body of [tagPush, deletion, zeroSha]) {
      const response = await POST(makeRequest(body));
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.ok).toBe(true);
      expect(payload.ignored).toBe(true);
    }
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('rejects a missing signature with 401 and never reaches enqueue', async () => {
    const response = await POST(makeRequest(validPushBody, {}, { includeSignature: false }));

    expect(response.status).toBe(401);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature with 401', async () => {
    const response = await POST(
      makeRequest(validPushBody, { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) })
    );

    expect(response.status).toBe(401);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('rejects a request with no X-GitHub-Delivery header with 400', async () => {
    const response = await POST(makeRequest(validPushBody, {}, { includeDelivery: false }));

    expect(response.status).toBe(400);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with 400 after the signature still verifies', async () => {
    const body = 'not json{{{';
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('rejects a structurally malformed push payload with 400', async () => {
    const body = JSON.stringify({ ref: 'refs/heads/main', after: 'a'.repeat(40) }); // missing installation/repository
    const response = await POST(makeRequest(body));

    expect(response.status).toBe(400);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('responds 500 without enqueueing when the GitHub App is not configured, and logs the real underlying error', async () => {
    // Regression: this path used to be a bare `catch {}` that swallowed the actual error
    // (e.g. a decrypt failure), leaving the server logs with nothing to diagnose it from -
    // a generic 500 was the only signal an operator ever saw.
    const underlyingError = new Error('Unsupported state or unable to authenticate data');
    requireGithubAppConfigMock.mockRejectedValue(underlyingError);

    const response = await POST(makeRequest(validPushBody));

    expect(response.status).toBe(500);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(expect.any(String), underlyingError);
  });

  it('responds 500 (not a false 2xx acceptance) when enqueueing fails', async () => {
    enqueueGithubPushEventMock.mockRejectedValue(new Error('database unreachable'));

    const response = await POST(makeRequest(validPushBody));

    expect(response.status).toBe(500);
  });

  it('rejects a payload larger than the documented body-size limit via Content-Length, without reading it', async () => {
    const response = await POST(
      makeRequest(validPushBody, { 'content-length': String(3 * 1024 * 1024) })
    );

    expect(response.status).toBe(413);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized body even with NO Content-Length header, cancelling the stream instead of buffering all of it', async () => {
    const limit = 2 * 1024 * 1024;
    const chunkSize = 64 * 1024;
    let bytesEmitted = 0;
    let cancelled = false;

    // A body larger than the limit, delivered as a stream rather than a pre-known string -
    // mirrors a real oversized request with no (or a lying) Content-Length header, which
    // request.arrayBuffer() alone would buffer to completion before any size check ran.
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (cancelled || bytesEmitted > limit * 2) {
          controller.close();
          return;
        }
        bytesEmitted += chunkSize;
        controller.enqueue(new Uint8Array(chunkSize).fill(97));
      },
      cancel() {
        cancelled = true;
      },
    });

    // `duplex: 'half'` is required by Node's fetch implementation for a streaming request
    // body, but isn't in NextRequest's constructor type yet - cast past that one field.
    const requestInit = {
      method: 'POST',
      headers: { 'x-github-delivery': 'delivery-1', 'x-github-event': 'push' }, // no content-length
      body: stream,
      duplex: 'half',
    } as unknown as ConstructorParameters<typeof NextRequest>[1];
    const request = new NextRequest('https://example.com/api/webhooks/github', requestInit);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
    expect(cancelled).toBe(true);
    // Proves the read stopped shortly after crossing the limit, not after the full
    // (much larger) body was buffered.
    expect(bytesEmitted).toBeLessThan(limit * 2);
  });

  it('verifies a body containing unicode characters correctly', async () => {
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      after: 'b'.repeat(40),
      deleted: false,
      installation: { id: 555 },
      repository: { id: 42, full_name: 'example/demo' },
      pusher: { name: '日本語テスト 🚀' },
    });
    enqueueGithubPushEventMock.mockResolvedValue({ eligibleAppIds: [1], insertedJobIds: [11] });

    const response = await POST(makeRequest(body));

    expect(response.status).toBe(202);
  });

  const validPullRequestBody = JSON.stringify({
    action: 'opened',
    installation: { id: 555 },
    repository: { id: 42, full_name: 'example/demo' },
    pull_request: {
      number: 12,
      head: { ref: 'feature/foo', sha: 'c'.repeat(40), repo: { id: 42 } },
    },
  });

  it('enqueues a signed pull_request opened event as a preview deploy', async () => {
    enqueueGithubPullRequestEventMock.mockResolvedValue({ eligibleAppIds: [1], insertedJobIds: [20] });

    const response = await POST(makeRequest(validPullRequestBody, {}, { event: 'pull_request' }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, queued: 1 });
    expect(enqueueGithubPushEventMock).not.toHaveBeenCalled();
    expect(enqueueGithubPullRequestEventMock).toHaveBeenCalledWith({
      installationId: 555,
      repoId: 42,
      branch: 'feature/foo',
      sha: 'c'.repeat(40),
      deliveryId: 'delivery-1',
      prNumber: 12,
      kind: 'deploy',
    });
  });

  it('enqueues a signed pull_request closed event as a teardown', async () => {
    const closed = JSON.stringify({
      ...JSON.parse(validPullRequestBody),
      action: 'closed',
    });
    enqueueGithubPullRequestEventMock.mockResolvedValue({ eligibleAppIds: [1], insertedJobIds: [21] });

    const response = await POST(makeRequest(closed, {}, { event: 'pull_request' }));

    expect(response.status).toBe(202);
    expect(enqueueGithubPullRequestEventMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'teardown', prNumber: 12 }));
  });

  it('acknowledges and ignores labeled pull_request actions without enqueueing', async () => {
    const labeled = JSON.stringify({ action: 'labeled' });
    const response = await POST(makeRequest(labeled, {}, { event: 'pull_request' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true, reason: 'ignored_action' });
    expect(enqueueGithubPullRequestEventMock).not.toHaveBeenCalled();
  });

  it('acknowledges and ignores a fork pull_request without enqueueing', async () => {
    const forked = JSON.stringify({
      action: 'opened',
      installation: { id: 555 },
      repository: { id: 42, full_name: 'example/demo' },
      pull_request: {
        number: 12,
        head: { ref: 'feature/foo', sha: 'c'.repeat(40), repo: { id: 99 } },
      },
    });
    const response = await POST(makeRequest(forked, {}, { event: 'pull_request' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true, reason: 'fork' });
    expect(enqueueGithubPullRequestEventMock).not.toHaveBeenCalled();
  });

  it('acknowledges a non-production push that enqueue reports as preview_requires_pull_request', async () => {
    enqueueGithubPushEventMock.mockResolvedValue({
      eligibleAppIds: [],
      insertedJobIds: [],
      ignoredReason: 'preview_requires_pull_request',
    });

    const response = await POST(makeRequest(validPushBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true, reason: 'preview_requires_pull_request' });
    expect(enqueueGithubPullRequestEventMock).not.toHaveBeenCalled();
  });
});
