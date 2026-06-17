import pool from '~/services/database';

export type CloudflareRouteSourceType = 'app' | 'service' | 'preview_wildcard';

export interface CloudflareHostnameRouteRow {
  id: number;
  hostname: string;
  zone_id: string;
  tunnel_id: string;
  dns_record_id: string | null;
  source_type: CloudflareRouteSourceType;
  source_id: string | null;
  created_at: Date;
}

export async function fetchManagedHostnameRoutes(): Promise<CloudflareHostnameRouteRow[]> {
  const result = await pool.query<CloudflareHostnameRouteRow>(
    `SELECT id, hostname, zone_id, tunnel_id, dns_record_id, source_type, source_id, created_at
     FROM cloudflare_hostname_routes
     ORDER BY hostname ASC`
  );
  return result.rows;
}

export async function fetchManagedRouteByHostname(
  hostname: string
): Promise<CloudflareHostnameRouteRow | null> {
  const result = await pool.query<CloudflareHostnameRouteRow>(
    `SELECT id, hostname, zone_id, tunnel_id, dns_record_id, source_type, source_id, created_at
     FROM cloudflare_hostname_routes
     WHERE hostname = $1`,
    [hostname]
  );
  return result.rows[0] ?? null;
}

export async function upsertManagedHostnameRoute(input: {
  hostname: string;
  zoneId: string;
  tunnelId: string;
  dnsRecordId: string | null;
  sourceType: CloudflareRouteSourceType;
  sourceId: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO cloudflare_hostname_routes
       (hostname, zone_id, tunnel_id, dns_record_id, source_type, source_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (hostname)
     DO UPDATE SET
       zone_id = EXCLUDED.zone_id,
       tunnel_id = EXCLUDED.tunnel_id,
       dns_record_id = EXCLUDED.dns_record_id,
       source_type = EXCLUDED.source_type,
       source_id = EXCLUDED.source_id`,
    [
      input.hostname,
      input.zoneId,
      input.tunnelId,
      input.dnsRecordId,
      input.sourceType,
      input.sourceId,
    ]
  );
}

export async function deleteManagedHostnameRoute(hostname: string): Promise<void> {
  await pool.query('DELETE FROM cloudflare_hostname_routes WHERE hostname = $1', [hostname]);
}
