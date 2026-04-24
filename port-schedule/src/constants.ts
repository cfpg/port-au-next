/** Fixed outbound HTTP behavior (SOW — not user-configurable). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_REDIRECTS = 3;
export const MAX_STORED_RESPONSE_BODY_BYTES = 65_536;
export const SCHEDULER_TICK_MS = 10_000;
export const MAX_OUTBOUND_CONCURRENCY = 20;
export const MIN_CRON_INTERVAL_MS = 10_000;
export const SERVICE_NAME = 'port-schedule';
export const SERVICE_VERSION = '0.1.0';
export const WEBHOOK_SIGNATURE_HEADER = 'X-PortAuNext-Schedule';
