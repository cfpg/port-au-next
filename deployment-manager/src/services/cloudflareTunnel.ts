import 'cloudflare/shims/web';
import type Cloudflare from 'cloudflare';
import logger from '~/services/logger';
import { getCloudflareCredentials } from '~/services/cloudflareClient';
import { normalizeHostname, resolveZoneForHostname } from '~/utils/cloudflareHostname';
import {
  deleteManagedHostnameRoute,
  fetchManagedHostnameRoutes,
  fetchManagedRouteByHostname,
  upsertManagedHostnameRoute,
  type CloudflareRouteSourceType,
} from '~/queries/cloudflareHostnameRoutesQuery';

function asTunnelIngress(ingress: IngressRule[]) {
  return ingress as NonNullable<
    import('cloudflare/resources/zero-trust/tunnels/cloudflared/configurations').ConfigurationUpdateParams['config']
  >['ingress'];
}

type IngressRule = {
  hostname?: string;
  service: string;
  path?: string;
  originRequest?: Record<string, unknown>;
};

const tunnelLocks = new Map<string, Promise<void>>();

async function withTunnelLock<T>(tunnelId: string, fn: () => Promise<T>): Promise<T> {
  const previous = tunnelLocks.get(tunnelId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  tunnelLocks.set(tunnelId, previous.then(() => current));
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (tunnelLocks.get(tunnelId) === current) {
      tunnelLocks.delete(tunnelId);
    }
  }
}

function isCatchAllRule(rule: IngressRule): boolean {
  return !rule.hostname && rule.service.startsWith('http_status:');
}

function countHostnameRoutes(ingress: IngressRule[] | undefined): number {
  return (ingress ?? []).filter((rule) => Boolean(rule.hostname)).length;
}

async function listAllZones(client: Cloudflare, accountId: string) {
  const zones: Array<{ id: string; name: string; status?: string }> = [];
  for await (const zone of client.zones.list({ account: { id: accountId }, per_page: 50 })) {
    zones.push({ id: zone.id, name: zone.name, status: zone.status });
  }
  return zones;
}

export interface TunnelSummary {
  id: string;
  name: string;
  status: string;
  replicas: number;
  routes: number;
  selected: boolean;
}

export interface PublishedApplication {
  hostname: string;
  service: string;
  type: 'Published application';
  managedBy: 'port-au-next' | 'external';
  sourceType?: CloudflareRouteSourceType;
  sourceId?: string | null;
}

class CloudflareTunnelService {
  async listTunnels(): Promise<TunnelSummary[]> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) return [];

    const { client, accountId, tunnelId: selectedTunnelId } = credentials;
    const tunnels: TunnelSummary[] = [];

    for await (const tunnel of client.zeroTrust.tunnels.cloudflared.list({
      account_id: accountId,
      is_deleted: false,
    })) {
      if (!tunnel.id || !tunnel.name) continue;

      const [replicas, routes] = await Promise.all([
        this.getReplicaCount(tunnel.id, accountId, client),
        this.getRouteCount(tunnel.id, accountId, client),
      ]);

      tunnels.push({
        id: tunnel.id,
        name: tunnel.name,
        status: tunnel.status ?? 'inactive',
        replicas,
        routes,
        selected: tunnel.id === selectedTunnelId,
      });
    }

    return tunnels;
  }

  async getReplicaCount(
    tunnelId: string,
    accountId: string,
    client?: Cloudflare
  ): Promise<number> {
    const credentials = client
      ? { client, accountId }
      : await getCloudflareCredentials();
    if (!credentials) return 0;

    const cf = client ?? credentials.client;
    const account = accountId ?? credentials.accountId;

    let count = 0;
    for await (const _connector of cf.zeroTrust.tunnels.cloudflared.connections.get(
      tunnelId,
      { account_id: account }
    )) {
      count += 1;
    }
    return count;
  }

  async getRouteCount(
    tunnelId: string,
    accountId: string,
    client?: Cloudflare
  ): Promise<number> {
    const ingress = await this.getIngressRules(tunnelId, accountId, client);
    return countHostnameRoutes(ingress);
  }

  async getIngressRules(
    tunnelId: string,
    accountId?: string,
    client?: Cloudflare
  ): Promise<IngressRule[]> {
    const credentials = client
      ? { client, accountId: accountId! }
      : await getCloudflareCredentials();
    if (!credentials) return [];

    const cf = client ?? credentials.client;
    const account = accountId ?? credentials.accountId;

    const configuration = await cf.zeroTrust.tunnels.cloudflared.configurations.get(
      tunnelId,
      { account_id: account }
    );

    return (configuration.config?.ingress ?? []) as IngressRule[];
  }

  async listPublishedApplications(tunnelId?: string): Promise<PublishedApplication[]> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) return [];

    const activeTunnelId = tunnelId ?? credentials.tunnelId;
    if (!activeTunnelId) return [];

    const ingress = await this.getIngressRules(activeTunnelId, credentials.accountId);
    const managedRoutes = await fetchManagedHostnameRoutes();
    const managedByHostname = new Map(managedRoutes.map((route) => [route.hostname, route]));

    return ingress
      .filter((rule) => Boolean(rule.hostname))
      .map((rule) => {
        const hostname = rule.hostname!;
        const managed = managedByHostname.get(hostname);
        return {
          hostname,
          service: rule.service,
          type: 'Published application' as const,
          managedBy: managed ? 'port-au-next' : 'external',
          sourceType: managed?.source_type,
          sourceId: managed?.source_id,
        };
      });
  }

  async createTunnel(name: string): Promise<{ id: string; name: string; token: string }> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) {
      throw new Error('Cloudflare is not connected');
    }

    const tunnel = await credentials.client.zeroTrust.tunnels.cloudflared.create({
      account_id: credentials.accountId,
      name,
      config_src: 'cloudflare',
    });

    if (!tunnel.id) {
      throw new Error('Cloudflare did not return a tunnel id');
    }

    const token = await credentials.client.zeroTrust.tunnels.cloudflared.token.get(
      tunnel.id,
      { account_id: credentials.accountId }
    );

    if (!token) {
      throw new Error('Cloudflare did not return a tunnel token');
    }

    return { id: tunnel.id, name: tunnel.name ?? name, token };
  }

  async getTunnelToken(tunnelId: string): Promise<string> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) {
      throw new Error('Cloudflare is not connected');
    }

    const token = await credentials.client.zeroTrust.tunnels.cloudflared.token.get(
      tunnelId,
      { account_id: credentials.accountId }
    );

    if (!token) {
      throw new Error('Cloudflare did not return a tunnel token');
    }

    return token;
  }

  async resolveZoneForHostname(hostname: string) {
    const credentials = await getCloudflareCredentials();
    if (!credentials) return null;

    const zones = await listAllZones(credentials.client, credentials.accountId);
    return resolveZoneForHostname(hostname, zones);
  }

  async getIngressRuleForHostname(
    hostname: string,
    tunnelId?: string
  ): Promise<IngressRule | null> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) return null;

    const activeTunnelId = tunnelId ?? credentials.tunnelId;
    if (!activeTunnelId) return null;

    const normalized = normalizeHostname(hostname);
    const ingress = await this.getIngressRules(
      activeTunnelId,
      credentials.accountId,
      credentials.client
    );

    return (
      ingress.find(
        (rule) => normalizeHostname(rule.hostname ?? '') === normalized
      ) ?? null
    );
  }

  async checkDnsRecord(
    zoneId: string,
    hostname: string,
    tunnelId: string
  ): Promise<'present' | 'missing' | 'wrong'> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) return 'missing';

    const normalized = normalizeHostname(hostname);
    const expected = `${tunnelId}.cfargotunnel.com`;

    const existing = await credentials.client.dns.records.list({
      zone_id: zoneId,
      type: 'CNAME',
      name: { exact: normalized },
    });

    const match = existing.result.find(
      (record) => normalizeHostname(record.name) === normalized
    );

    if (!match) return 'missing';
    if (match.content === expected && match.proxied) return 'present';
    return 'wrong';
  }

  async ensureDnsRecord(zoneId: string, hostname: string, tunnelId: string): Promise<string> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) {
      throw new Error('Cloudflare is not connected');
    }

    const normalized = normalizeHostname(hostname);
    const content = `${tunnelId}.cfargotunnel.com`;

    const existing = await credentials.client.dns.records.list({
      zone_id: zoneId,
      type: 'CNAME',
      name: { exact: normalized },
    });

    const match = existing.result.find(
      (record) => normalizeHostname(record.name) === normalized
    );

    if (match) {
      if (match.content !== content || !match.proxied) {
        await credentials.client.dns.records.update(match.id, {
          zone_id: zoneId,
          type: 'CNAME',
          name: normalized,
          content,
          proxied: true,
          ttl: 1,
        });
      }
      return match.id;
    }

    const created = await credentials.client.dns.records.create({
      zone_id: zoneId,
      type: 'CNAME',
      name: normalized,
      content,
      proxied: true,
      ttl: 1,
    });

    return created.id;
  }

  async removeDnsRecord(zoneId: string, hostname: string, tunnelId: string): Promise<void> {
    const credentials = await getCloudflareCredentials();
    if (!credentials) return;

    const normalized = normalizeHostname(hostname);
    const content = `${tunnelId}.cfargotunnel.com`;

    const existing = await credentials.client.dns.records.list({
      zone_id: zoneId,
      type: 'CNAME',
      name: { exact: normalized },
    });

    for (const record of existing.result) {
      if (record.content === content) {
        await credentials.client.dns.records.delete(record.id, { zone_id: zoneId });
      }
    }
  }

  async addPublishedApplication(input: {
    hostname: string;
    service?: string;
    sourceType: CloudflareRouteSourceType;
    sourceId: string | null;
  }): Promise<{ zoneId: string }> {
    const credentials = await getCloudflareCredentials();
    if (!credentials?.tunnelId) {
      throw new Error('Select a Cloudflare tunnel in Settings before assigning hostnames.');
    }

    const hostname = normalizeHostname(input.hostname);
    const zone = await this.resolveZoneForHostname(hostname);
    if (!zone) {
      throw new Error(
        'Domain not found in Cloudflare. Add it in your Cloudflare dashboard first.'
      );
    }
    if (zone.status !== 'active') {
      throw new Error('Zone is pending. Update nameservers at your registrar.');
    }

    const service = input.service ?? credentials.tunnelOriginUrl;
    const { tunnelId, accountId, client } = credentials;

    let dnsRecordId: string | null = null;

    await withTunnelLock(tunnelId, async () => {
      const ingress = await this.getIngressRules(tunnelId, accountId, client);
      const withoutHostname = ingress.filter(
        (rule) => normalizeHostname(rule.hostname ?? '') !== hostname
      );
      const catchAll =
        withoutHostname.find(isCatchAllRule) ??
        ({ service: 'http_status:404' } satisfies IngressRule);
      const hostnameRules = withoutHostname.filter((rule) => !isCatchAllRule(rule));

      const updatedIngress: IngressRule[] = [
        ...hostnameRules,
        { hostname, service, originRequest: {} },
        catchAll,
      ];

      await client.zeroTrust.tunnels.cloudflared.configurations.update(tunnelId, {
        account_id: accountId,
        config: { ingress: asTunnelIngress(updatedIngress) },
      });

      try {
        dnsRecordId = await this.ensureDnsRecord(zone.zoneId, hostname, tunnelId);
      } catch (error) {
        const rollbackIngress = ingress;
        await client.zeroTrust.tunnels.cloudflared.configurations.update(tunnelId, {
          account_id: accountId,
          config: { ingress: asTunnelIngress(rollbackIngress) },
        });
        throw error;
      }
    });

    await upsertManagedHostnameRoute({
      hostname,
      zoneId: zone.zoneId,
      tunnelId,
      dnsRecordId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });

    await logger.info('Cloudflare published application created', {
      hostname,
      tunnelId,
      zoneId: zone.zoneId,
    });

    return { zoneId: zone.zoneId };
  }

  async removePublishedApplication(hostname: string): Promise<void> {
    const credentials = await getCloudflareCredentials();
    if (!credentials?.tunnelId) return;

    const normalized = normalizeHostname(hostname);
    const route = await fetchManagedRouteByHostname(normalized);
    if (!route) return;

    const { tunnelId, accountId, client } = credentials;

    await withTunnelLock(tunnelId, async () => {
      const ingress = await this.getIngressRules(tunnelId, accountId, client);
      const catchAll =
        ingress.find(isCatchAllRule) ??
        ({ service: 'http_status:404' } satisfies IngressRule);
      const updatedIngress = ingress.filter((rule) => {
        if (isCatchAllRule(rule)) return false;
        return normalizeHostname(rule.hostname ?? '') !== normalized;
      });
      updatedIngress.push(catchAll);

      await client.zeroTrust.tunnels.cloudflared.configurations.update(tunnelId, {
        account_id: accountId,
        config: { ingress: asTunnelIngress(updatedIngress) },
      });
    });

    if (route) {
      await this.removeDnsRecord(route.zone_id, normalized, tunnelId);
      await deleteManagedHostnameRoute(normalized);
    }

    await logger.info('Cloudflare published application removed', { hostname: normalized });
  }
}

export default new CloudflareTunnelService();
