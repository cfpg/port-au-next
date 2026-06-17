'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import Button from '~/components/general/Button';
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

function statusBadgeClass(routeStatus: string): string {
  switch (routeStatus) {
    case 'synced':
      return 'bg-green-100 text-green-800';
    case 'external':
      return 'bg-blue-100 text-blue-800';
    case 'missing_route':
    case 'missing_dns':
    case 'dns_wrong':
    case 'zone_pending':
    case 'zone_not_found':
      return 'bg-amber-100 text-amber-800';
    case 'not_ready':
    case 'not_configured':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
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

function HostnameStatusBlock({
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

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-gray-900">{title}</h4>
          {status.hostname && (
            <p className="font-mono text-sm text-gray-700 mt-1">{status.hostname}</p>
          )}
        </div>
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(status.routeStatus)}`}
        >
          {status.routeStatus === 'synced'
            ? 'Synced'
            : status.routeStatus === 'external'
              ? 'External'
              : status.routeStatus.replace(/_/g, ' ')}
        </span>
      </div>

      <p className="text-sm text-gray-600">{status.routeStatusLabel}</p>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {status.managedBy && (
          <>
            <dt className="text-gray-500">Managed by</dt>
            <dd className="text-gray-900 capitalize">
              {status.managedBy === 'port-au-next' ? 'Port-Au-Next' : 'External'}
            </dd>
          </>
        )}
        {status.service && (
          <>
            <dt className="text-gray-500">Service</dt>
            <dd className="font-mono text-gray-900">{status.service}</dd>
          </>
        )}
        {status.zoneName && (
          <>
            <dt className="text-gray-500">Zone</dt>
            <dd className="text-gray-900">
              {status.zoneName}
              {status.zoneStatus ? ` (${status.zoneStatus})` : ''}
            </dd>
          </>
        )}
        {status.zoneId && (
          <>
            <dt className="text-gray-500">Zone ID</dt>
            <dd className="font-mono text-gray-900 text-xs break-all">{status.zoneId}</dd>
          </>
        )}
        {status.dnsTarget && status.dnsStatus !== 'unknown' && (
          <>
            <dt className="text-gray-500">DNS</dt>
            <dd className="text-gray-900">{dnsLabel(status.dnsStatus)}</dd>
          </>
        )}
      </dl>

      {canSync && onSync && (
        <Button color="blue" size="sm" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? 'Syncing…' : syncLabel}
        </Button>
      )}
    </div>
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
    return <p className="text-sm text-gray-500">Loading Cloudflare status…</p>;
  }

  if (!data) {
    return <p className="text-sm text-gray-500">Unable to load Cloudflare status.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">
            Tunnel route and DNS status for this app&apos;s hostnames.
          </p>
        </div>
        <Link
          href="/settings"
          className="text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Cloudflare Settings
        </Link>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <span className="text-gray-500">Connection: </span>
            <span className="font-medium">{data.readinessLabel}</span>
          </span>
          {data.tunnelName && (
            <span>
              <span className="text-gray-500">Tunnel: </span>
              <span className="font-medium">{data.tunnelName}</span>
            </span>
          )}
          <span>
            <span className="text-gray-500">Cache purge: </span>
            <span className="font-medium">{data.cachePurgeEnabled ? 'Enabled' : 'Disabled'}</span>
          </span>
        </div>
      </div>

      {data.readiness === 'not_connected' && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          Connect your Cloudflare account in{' '}
          <Link href="/settings" className="underline font-medium">
            Settings → Cloudflare
          </Link>{' '}
          to manage tunnel routes for this app.
        </p>
      )}

      {data.readiness === 'no_tunnel' && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          Select a tunnel in{' '}
          <Link href="/settings" className="underline font-medium">
            Settings → Cloudflare
          </Link>{' '}
          before syncing routes.
        </p>
      )}

      {!app.domain ? (
        <p className="text-sm text-gray-500">
          Set a domain in App Settings above to configure a tunnel route.
        </p>
      ) : (
        <HostnameStatusBlock
          title="App domain"
          status={data.domain}
          onSync={() => handleSync('domain')}
          isSyncing={isSyncing}
          syncLabel="Sync route"
        />
      )}

      {data.preview && (
        <HostnameStatusBlock
          title="Preview wildcard"
          status={data.preview}
          onSync={() => handleSync('preview')}
          isSyncing={isSyncing}
          syncLabel="Sync preview route"
        />
      )}

      {app.domain && data.preview && data.readiness === 'ready' && (
        <Button color="gray-light" size="sm" onClick={() => handleSync('all')} disabled={isSyncing}>
          Sync domain + preview
        </Button>
      )}
    </div>
  );
}
