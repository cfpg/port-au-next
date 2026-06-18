import pool from '~/services/database';
import { fetchManagedRouteByHostname } from '~/queries/cloudflareHostnameRoutesQuery';
import { getCloudflareCredentials } from '~/services/cloudflareClient';
import cloudflareTunnel from '~/services/cloudflareTunnel';
import { getPreviewWildcardHostname, normalizeHostname } from '~/utils/cloudflareHostname';
import { isPreviewBranchesEnabled } from '~/services/previewBranches';

export type CloudflareReadiness = 'not_connected' | 'no_tunnel' | 'ready';

export type HostnameRouteStatus =
  | 'not_configured'
  | 'not_ready'
  | 'zone_not_found'
  | 'zone_pending'
  | 'synced'
  | 'external'
  | 'missing_route'
  | 'missing_dns'
  | 'dns_wrong';

export interface HostnameCloudflareStatus {
  hostname: string | null;
  routeStatus: HostnameRouteStatus;
  routeStatusLabel: string;
  managedBy: 'port-au-next' | 'external' | null;
  service: string | null;
  zoneId: string | null;
  zoneName: string | null;
  zoneStatus: string | null;
  dnsStatus: 'present' | 'missing' | 'wrong' | 'unknown';
  dnsTarget: string | null;
}

export interface AppCloudflareStatus {
  readiness: CloudflareReadiness;
  readinessLabel: string;
  tunnelId: string | null;
  tunnelName: string | null;
  tunnelOriginUrl: string | null;
  cachePurgeEnabled: boolean;
  domain: HostnameCloudflareStatus;
  preview: HostnameCloudflareStatus | null;
}

const ROUTE_STATUS_LABELS: Record<HostnameRouteStatus, string> = {
  not_configured: 'No domain configured',
  not_ready: 'Connect Cloudflare and select a tunnel in Settings',
  zone_not_found: 'Zone not found in Cloudflare',
  zone_pending: 'Zone pending — update nameservers',
  synced: 'Synced — route and DNS managed by Port-Au-Next',
  external: 'External route on tunnel (not managed here)',
  missing_route: 'Missing tunnel route',
  missing_dns: 'Route exists — DNS record missing',
  dns_wrong: 'Route exists — DNS points elsewhere',
};

export async function buildHostnameStatus(
  hostname: string | null | undefined,
  readiness: CloudflareReadiness,
  tunnelId: string | null,
  tunnelOriginUrl: string | null
): Promise<HostnameCloudflareStatus> {
  const empty: HostnameCloudflareStatus = {
    hostname: hostname ? normalizeHostname(hostname) : null,
    routeStatus: 'not_configured',
    routeStatusLabel: ROUTE_STATUS_LABELS.not_configured,
    managedBy: null,
    service: null,
    zoneId: null,
    zoneName: null,
    zoneStatus: null,
    dnsStatus: 'unknown',
    dnsTarget: tunnelId ? `${tunnelId}.cfargotunnel.com` : null,
  };

  if (!hostname) return empty;

  const normalized = normalizeHostname(hostname);

  if (readiness !== 'ready' || !tunnelId) {
    return {
      ...empty,
      hostname: normalized,
      routeStatus: 'not_ready',
      routeStatusLabel: ROUTE_STATUS_LABELS.not_ready,
    };
  }

  const zone = await cloudflareTunnel.resolveZoneForHostname(normalized);
  if (!zone) {
    return {
      ...empty,
      hostname: normalized,
      routeStatus: 'zone_not_found',
      routeStatusLabel: ROUTE_STATUS_LABELS.zone_not_found,
    };
  }

  if (zone.status !== 'active') {
    return {
      ...empty,
      hostname: normalized,
      routeStatus: 'zone_pending',
      routeStatusLabel: ROUTE_STATUS_LABELS.zone_pending,
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      zoneStatus: zone.status,
    };
  }

  const [managedRoute, ingressRule, dnsStatus] = await Promise.all([
    fetchManagedRouteByHostname(normalized),
    cloudflareTunnel.getIngressRuleForHostname(normalized, tunnelId),
    cloudflareTunnel.checkDnsRecord(zone.zoneId, normalized, tunnelId),
  ]);

  const base = {
    hostname: normalized,
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    zoneStatus: zone.status,
    dnsStatus,
    dnsTarget: `${tunnelId}.cfargotunnel.com`,
    service: ingressRule?.service ?? tunnelOriginUrl,
  };

  if (managedRoute && ingressRule) {
    const routeStatus: HostnameRouteStatus =
      dnsStatus === 'present'
        ? 'synced'
        : dnsStatus === 'wrong'
          ? 'dns_wrong'
          : 'missing_dns';

    return {
      ...base,
      routeStatus,
      routeStatusLabel: ROUTE_STATUS_LABELS[routeStatus],
      managedBy: 'port-au-next',
    };
  }

  if (ingressRule) {
    const routeStatus: HostnameRouteStatus =
      dnsStatus === 'present'
        ? 'external'
        : dnsStatus === 'wrong'
          ? 'dns_wrong'
          : 'missing_dns';

    return {
      ...base,
      routeStatus,
      routeStatusLabel: ROUTE_STATUS_LABELS[routeStatus],
      managedBy: 'external',
    };
  }

  if (managedRoute) {
    return {
      ...base,
      routeStatus: 'missing_route',
      routeStatusLabel: ROUTE_STATUS_LABELS.missing_route,
      managedBy: 'port-au-next',
    };
  }

  return {
    ...base,
    routeStatus: 'missing_route',
    routeStatusLabel: ROUTE_STATUS_LABELS.missing_route,
    managedBy: null,
  };
}

export async function getAppCloudflareStatus(appId: number): Promise<AppCloudflareStatus> {
  const appResult = await pool.query<{
    domain: string | null;
    preview_domain: string | null;
    cloudflare_zone_id: string | null;
  }>('SELECT domain, preview_domain, cloudflare_zone_id FROM apps WHERE id = $1', [appId]);

  const app = appResult.rows[0];
  if (!app) {
    throw new Error('App not found');
  }

  const credentials = await getCloudflareCredentials();
  let readiness: CloudflareReadiness = 'not_connected';
  if (credentials) {
    readiness = credentials.tunnelId ? 'ready' : 'no_tunnel';
  }

  const readinessLabel =
    readiness === 'not_connected'
      ? 'Cloudflare not connected'
      : readiness === 'no_tunnel'
        ? 'No tunnel selected'
        : 'Ready';

  const domainStatus = await buildHostnameStatus(
    app.domain,
    readiness,
    credentials?.tunnelId ?? null,
    credentials?.tunnelOriginUrl ?? null
  );

  let previewStatus: HostnameCloudflareStatus | null = null;
  const previewEnabled = await isPreviewBranchesEnabled(appId);
  if (previewEnabled && app.preview_domain) {
    previewStatus = await buildHostnameStatus(
      getPreviewWildcardHostname(app.preview_domain),
      readiness,
      credentials?.tunnelId ?? null,
      credentials?.tunnelOriginUrl ?? null
    );
  }

  return {
    readiness,
    readinessLabel,
    tunnelId: credentials?.tunnelId ?? null,
    tunnelName: credentials?.tunnelName ?? null,
    tunnelOriginUrl: credentials?.tunnelOriginUrl ?? null,
    cachePurgeEnabled: Boolean(app.cloudflare_zone_id && credentials),
    domain: domainStatus,
    preview: previewStatus,
  };
}
