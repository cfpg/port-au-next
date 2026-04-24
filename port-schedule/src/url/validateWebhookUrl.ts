import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'host.docker.internal',
  'nginx',
]);

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true; // link-local + metadata
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // unique local IPv6
  if (ip.startsWith('fe80:')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1] ?? '0', 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/** SOW §11: http(s) only, public FQDN, no IP literal host, no internal docker names, resolve and reject private IPs. */
export async function validateWebhookUrl(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'Only http: and https: URLs are allowed' };
  }

  const hostname = u.hostname.toLowerCase();
  if (!hostname || net.isIP(hostname) !== 0) {
    return { ok: false, reason: 'Hostname must be a DNS name, not an IP literal' };
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.svc.cluster.local')) {
    return { ok: false, reason: 'Hostname is not allowed' };
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: 'Hostname is blocked' };
  }

  const labels = hostname.split('.');
  if (labels.length < 2) {
    return { ok: false, reason: 'Hostname must be a fully qualified domain' };
  }

  try {
    const addrs4 = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addrs6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addrs4, ...addrs6];
    if (all.length === 0) {
      return { ok: false, reason: 'Hostname does not resolve' };
    }
    for (const ip of all) {
      if (isPrivateIp(ip)) {
        return { ok: false, reason: 'Hostname resolves to a disallowed address' };
      }
    }
  } catch {
    return { ok: false, reason: 'DNS resolution failed' };
  }

  return { ok: true, url: u };
}
