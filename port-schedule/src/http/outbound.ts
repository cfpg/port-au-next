import {
  MAX_REDIRECTS,
  MAX_STORED_RESPONSE_BODY_BYTES,
  REQUEST_TIMEOUT_MS,
  SERVICE_NAME,
  SERVICE_VERSION,
  WEBHOOK_SIGNATURE_HEADER,
} from '../constants.js';

const BLOCKED_REQUEST_HEADER_NAMES = new Set(
  ['host', 'connection', 'content-length', WEBHOOK_SIGNATURE_HEADER.toLowerCase()]
);

export type OutboundResult =
  | {
      ok: true;
      httpStatus: number;
      responseHeaders: Record<string, string>;
      responseBodyStored: string;
    }
  | { ok: false; error: string; httpStatus?: number };

function mergeHeaders(
  base: Record<string, string>,
  extra: Record<string, unknown> | null | undefined
): Record<string, string> {
  const out = { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const [k, v] of Object.entries(extra)) {
    const key = k.toLowerCase();
    if (BLOCKED_REQUEST_HEADER_NAMES.has(key)) continue;
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

async function readBodyTruncated(res: Response): Promise<string> {
  const buf = new Uint8Array(await res.arrayBuffer());
  const slice = buf.slice(0, MAX_STORED_RESPONSE_BODY_BYTES);
  const text = new TextDecoder('utf8', { fatal: false }).decode(slice);
  if (buf.byteLength > MAX_STORED_RESPONSE_BODY_BYTES) {
    return `${text}\n…[truncated at ${MAX_STORED_RESPONSE_BODY_BYTES} bytes]`;
  }
  return text;
}

function headersToRecord(res: Response): Record<string, string> {
  const o: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    o[k] = v;
  });
  return o;
}

export type UrlValidator = (rawUrl: string) => Promise<{ ok: true; url: URL } | { ok: false; reason: string }>;

export async function executeOutboundWebhook(
  input: {
    method: string;
    url: string;
    headersJson: unknown;
    body: string | null;
    webhookSecret: string | null;
  },
  validateUrl: UrlValidator
): Promise<OutboundResult> {
  const ua = `${SERVICE_NAME}/${SERVICE_VERSION}`;
  const baseHeaders: Record<string, string> = {
    'user-agent': ua,
    accept: '*/*',
  };
  if (input.webhookSecret) {
    baseHeaders[WEBHOOK_SIGNATURE_HEADER] = input.webhookSecret;
  }
  const headers = mergeHeaders(baseHeaders, input.headersJson as Record<string, unknown> | undefined);

  const first = await validateUrl(input.url);
  if (!first.ok) return { ok: false, error: first.reason };
  let currentUrl = first.url.toString();
  let method = input.method.toUpperCase();
  let body = input.body;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(currentUrl, {
        method,
        headers,
        body: ['GET', 'HEAD'].includes(method) ? undefined : body ?? undefined,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (redirectCount === MAX_REDIRECTS) {
          return { ok: false, error: 'Too many redirects', httpStatus: res.status };
        }
        const loc = res.headers.get('location')!;
        const nextUrl = new URL(loc, currentUrl).toString();
        const v = await validateUrl(nextUrl);
        if (!v.ok) return { ok: false, error: `Redirect target rejected: ${v.reason}`, httpStatus: res.status };
        currentUrl = v.url.toString();
        method = 'GET';
        body = null;
        continue;
      }

      const httpStatus = res.status;
      const responseHeaders = headersToRecord(res);
      const responseBodyStored = await readBodyTruncated(res);
      return { ok: true, httpStatus, responseHeaders, responseBodyStored };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    } finally {
      clearTimeout(t);
    }
  }

  return { ok: false, error: 'Redirect loop' };
}
