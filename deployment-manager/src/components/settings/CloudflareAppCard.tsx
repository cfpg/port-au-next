'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Button from '~/components/general/Button';
import Link from '~/components/general/Link';
import Callout from '~/components/general/Callout';
import RouteStatusCard from '~/components/general/RouteStatusCard';
import { BadgeTone } from '~/components/general/Badge';
import { showToast } from '~/components/general/Toaster';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';

interface HostnameCloudflareStatus {
  hostname: string | null;
  routeStatus: string;
  routeStatusLabel: string;
  managedBy: 'port-au-next' | 'external' | null;
  service: string | null;
  zoneId: string | null;
  zoneName: string | null;
  zoneStatus: string | null;
  dnsStatus: 'present' | 'missing' | 'wrong' | 'unknown';
  dnsTarget: string | null;
}

interface AppCloudflareStatus {
  readiness: 'not_connected' | 'no_tunnel' | 'ready';
  readinessLabel: string;
  tunnelId: string | null;
  tunnelName: string | null;
  tunnelOriginUrl: string | null;
  cachePurgeEnabled: boolean;
  domain: HostnameCloudflareStatus;
  preview: HostnameCloudflareStatus | null;
}

interface CloudflareAppCardProps {
  app: App;
}

type RouteStatusRow = { label: string; value: React.ReactNode };

function routeTone(routeStatus: string): BadgeTone {
  switch (routeStatus) {
    case 'synced':
      return 'success';
    case 'external':
      return 'idle';
    case 'not_ready':
    case 'not_configured':
      return 'idle';
    default:
      return 'warning';
  }
}

function routeStatusLabel(routeStatus: string): string {
  if (routeStatus === 'synced') return 'synced';
  if (routeStatus === 'external') return 'external';
  return routeStatus.replace(/_/g, ' ');
}

function dnsLabel(status: HostnameCloudflareStatus['dnsStatus']): string {
  switch (status) {
    case 'present':
      return 'Proxied CNAME present';
    case 'missing':
      return 'CNAME missing';
    case 'wrong':
      return 'CNAME incorrect';
    default:
      return 'Unknown';
  }
}

function HostnameRouteCard({
  title,
  status,
  onSync,
  isSyncing,
  syncLabel,
}: {
  title: string;
  status: HostnameCloudflareStatus;
  onSync?: () => void;
  isSyncing: boolean;
  syncLabel: string;
}) {
  if (status.routeStatus === 'not_configured') {
    return null;
  }

  const canSync =
    status.routeStatus !== 'not_ready' &&
    status.routeStatus !== 'zone_not_found' &&
    status.routeStatus !== 'zone_pending';

  const rows: (RouteStatusRow | null)[] = [
    status.managedBy ? { label: 'Managed by', value: status.managedBy === 'port-au-next' ? 'Port-Au-Next' : 'External' } : null,
    status.service ? { label: 'Service', value: status.service } : null,
    status.zoneName ? { label: 'Zone', value: `${status.zoneName}${status.zoneStatus ? ` (${status.zoneStatus})` : ''}` } : null,
    status.zoneId ? { label: 'Zone ID', value: <span className="truncate block max-w-190">{status.zoneId}</span> } : null,
    status.dnsTarget && status.dnsStatus !== 'unknown' ? { label: 'DNS', value: dnsLabel(status.dnsStatus) } : null,
  ];
  const visibleRows = rows.filter((row): row is RouteStatusRow => row !== null);

  return (
    <RouteStatusCard
      title={title}
      hostname={status.hostname}
      tone={routeTone(status.routeStatus)}
      statusLabel={routeStatusLabel(status.routeStatus)}
      description={status.routeStatusLabel}
      rows={visibleRows}
      action={
        canSync && onSync ? (
          <Button variant={status.routeStatus === 'synced' ? 'secondary' : 'primary'} size="sm" onClick={onSync} loading={isSyncing}>
            {syncLabel}
          </Button>
        ) : undefined
      }
    />
  );
}

export default function CloudflareAppCard({ app }: CloudflareAppCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const { data, mutate, isLoading } = useSWR<AppCloudflareStatus>(
    `/api/apps/${app.id}/cloudflare`,
    fetcher
  );

  const handleSync = async (scope: 'domain' | 'preview' | 'all') => {
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/cloudflare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to sync Cloudflare route');
      }
      await mutate();
      showToast('Cloudflare route synced', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to sync route', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return <p className="text-panel text-ink-faint">Loading Cloudflare status…</p>;
  }

  if (!data) {
    return <p className="text-panel text-ink-faint">Unable to load Cloudflare status.</p>;
  }

  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-wrap items-center justify-between gap-9">
        <p className="text-panel text-ink-muted">Tunnel route and DNS status for this app&apos;s hostnames.</p>
        <Link href="/settings" variant="hostname">Cloudflare Settings</Link>
      </div>

      <div className="flex flex-wrap gap-x-18 gap-y-4 px-11 py-9 bg-paper border border-line rounded-menu text-field">
        <span><span className="text-ink-faint">Connection: </span><span className="font-medium text-ink">{data.readinessLabel}</span></span>
        {data.tunnelName && (
          <span><span className="text-ink-faint">Tunnel: </span><span className="font-medium text-ink">{data.tunnelName}</span></span>
        )}
        <span><span className="text-ink-faint">Cache purge: </span><span className="font-medium text-ink">{data.cachePurgeEnabled ? 'Enabled' : 'Disabled'}</span></span>
      </div>

      {data.readiness === 'not_connected' && (
        <Callout tone="warning">
          Connect your Cloudflare account in <Link href="/settings" variant="default" className="underline font-medium">Settings → Cloudflare</Link> to manage tunnel routes for this app.
        </Callout>
      )}

      {data.readiness === 'no_tunnel' && (
        <Callout tone="warning">
          Select a tunnel in <Link href="/settings" variant="default" className="underline font-medium">Settings → Cloudflare</Link> before syncing routes.
        </Callout>
      )}

      {!app.domain ? (
        <p className="text-panel text-ink-faint">Set a domain in App Settings above to configure a tunnel route.</p>
      ) : (
        <HostnameRouteCard
          title="App domain"
          status={data.domain}
          onSync={() => handleSync('domain')}
          isSyncing={isSyncing}
          syncLabel="Sync route"
        />
      )}

      {data.preview && (
        <HostnameRouteCard
          title="Preview wildcard"
          status={data.preview}
          onSync={() => handleSync('preview')}
          isSyncing={isSyncing}
          syncLabel="Sync preview route"
        />
      )}

      {app.domain && data.preview && data.readiness === 'ready' && (
        <Button variant="secondary" size="sm" onClick={() => handleSync('all')} loading={isSyncing}>
          Sync domain + preview
        </Button>
      )}
    </div>
  );
}
