export interface ResolvedCloudflareZone {
  zoneId: string;
  zoneName: string;
  status: string;
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

export function resolveZoneForHostname(
  hostname: string,
  zones: Array<{ id: string; name: string; status?: string }>
): ResolvedCloudflareZone | null {
  const normalized = normalizeHostname(hostname);
  const wildcardBase = normalized.startsWith('*.') ? normalized.slice(2) : normalized;

  const sorted = [...zones].sort(
    (a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0)
  );

  for (const zone of sorted) {
    const zoneName = normalizeHostname(zone.name);
    if (
      wildcardBase === zoneName ||
      wildcardBase.endsWith(`.${zoneName}`)
    ) {
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        status: zone.status ?? 'unknown',
      };
    }
  }

  return null;
}

export function getPreviewWildcardHostname(previewDomain: string): string {
  const domain = normalizeHostname(previewDomain.replace(/^\*\./, ''));
  return `*.${domain}`;
}
