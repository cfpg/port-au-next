'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { showToast } from '~/components/general/Toaster';
import Disclosure from '~/components/general/Disclosure';
import CopyField from '~/components/general/CopyField';
import Callout from '~/components/general/Callout';
import Badge, { BadgeTone } from '~/components/general/Badge';
import CodeToken from '~/components/general/CodeToken';
import Table, { TableColumn } from '~/components/general/Table';
import fetcher from '~/utils/fetcher';

interface CloudflareConfigStatus {
  connected: boolean;
  envFallback?: boolean;
  accountId?: string;
  tunnelId?: string | null;
  tunnelName?: string | null;
  tunnelOriginUrl?: string;
  tokenMasked?: string;
}

interface TunnelSummary {
  id: string;
  name: string;
  status: string;
  replicas: number;
  routes: number;
  selected: boolean;
}

interface PublishedApplication {
  hostname: string;
  service: string;
  type: string;
  managedBy: 'port-au-next' | 'external';
  sourceType?: 'app' | 'service' | 'preview_wildcard';
  sourceId?: string | null;
}

interface PlatformServiceStatus {
  id: string;
  label: string;
  envKey: string;
  required: boolean;
  hostname: {
    hostname: string | null;
    routeStatus: string;
    routeStatusLabel: string;
    dnsStatus: 'present' | 'missing' | 'wrong' | 'unknown';
  };
}

interface PlatformServicesOverview {
  readiness: string;
  services: PlatformServiceStatus[];
}

function routeTone(routeStatus: string): BadgeTone {
  if (routeStatus === 'synced') return 'success';
  if (routeStatus === 'external') return 'idle';
  if (routeStatus === 'not_ready' || routeStatus === 'not_configured') return 'idle';
  return 'warning';
}

function dnsStatusLabel(status: PlatformServiceStatus['hostname']['dnsStatus']): string {
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

function formatManagedBy(route: PublishedApplication): string {
  if (route.managedBy !== 'port-au-next') return 'External';
  if (route.sourceType === 'service' && route.sourceId) {
    return `Port-Au-Next (${route.sourceId})`;
  }
  if (route.sourceType === 'preview_wildcard') return 'Port-Au-Next (preview)';
  if (route.sourceType === 'app') return 'Port-Au-Next (app)';
  return 'Port-Au-Next';
}

function tunnelTone(status: string): BadgeTone {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'down':
    case 'inactive':
      return 'danger';
    default:
      return 'idle';
  }
}

export default function CloudflareSettingsCard() {
  const { data: config, mutate: mutateConfig } = useSWR<CloudflareConfigStatus>(
    '/api/cloudflare/config',
    fetcher
  );
  const { data: tunnelsData, mutate: mutateTunnels } = useSWR<{ tunnels: TunnelSummary[] }>(
    config?.connected ? '/api/cloudflare/tunnels' : null,
    fetcher
  );

  const selectedTunnelId = config?.tunnelId ?? null;
  const { data: routesData, mutate: mutateRoutes } = useSWR<{ routes: PublishedApplication[] }>(
    selectedTunnelId ? `/api/cloudflare/tunnels/${selectedTunnelId}/routes` : null,
    fetcher
  );
  const { data: platformServicesData, mutate: mutatePlatformServices } =
    useSWR<PlatformServicesOverview>(
      config?.connected ? '/api/cloudflare/services' : null,
      fetcher
    );

  const [accountId, setAccountId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [tunnelOriginUrl, setTunnelOriginUrl] = useState('http://localhost');
  const [newTunnelName, setNewTunnelName] = useState('');
  const [tunnelToken, setTunnelToken] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (config?.tunnelOriginUrl) {
      setTunnelOriginUrl(config.tunnelOriginUrl);
    }
  }, [config?.tunnelOriginUrl]);

  const connected = config?.connected === true;
  const tunnels = tunnelsData?.tunnels ?? [];
  const routes = routesData?.routes ?? [];
  const platformServices = platformServicesData?.services ?? [];

  const refreshPlatformAndRoutes = async () => {
    await Promise.all([mutatePlatformServices(), mutateRoutes(), mutateTunnels()]);
  };

  const handleConnect = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/cloudflare/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, apiToken, tunnelOriginUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to connect');

      setApiToken('');
      await mutateConfig();
      await mutateTunnels();
      showToast('Cloudflare account connected', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to connect', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/cloudflare/config', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to disconnect');
      setTunnelToken(null);
      await mutateConfig();
      showToast('Cloudflare disconnected', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to disconnect', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTestConnection = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/cloudflare/config', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Connection test failed');
      showToast(`Connected - ${payload.tunnelCount ?? 0} tunnel(s) found`, 'success');
      await mutateTunnels();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Connection test failed', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectTunnel = async (tunnel: TunnelSummary) => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/cloudflare/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelId: tunnel.id, tunnelName: tunnel.name }),
      });
      if (!response.ok) throw new Error('Failed to select tunnel');
      await mutateConfig();
      await mutateTunnels();
      await mutatePlatformServices();
      showToast(`Selected tunnel ${tunnel.name}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to select tunnel', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateTunnel = async () => {
    if (!newTunnelName.trim()) {
      showToast('Enter a tunnel name', 'warning');
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch('/api/cloudflare/tunnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTunnelName.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to create tunnel');

      setTunnelToken(payload.tunnel?.token ?? null);
      setNewTunnelName('');
      await mutateTunnels();
      showToast('Tunnel created - install cloudflared with the token below', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create tunnel', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleShowToken = async (tunnelId: string) => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/cloudflare/tunnels/${tunnelId}/token`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to fetch token');
      setTunnelToken(payload.token ?? null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to fetch token', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveOriginUrl = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/cloudflare/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelOriginUrl }),
      });
      if (!response.ok) throw new Error('Failed to update service URL');
      await mutateConfig();
      showToast('Tunnel service URL updated', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update service URL', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveRoute = async (hostname: string) => {
    setIsBusy(true);
    try {
      const response = await fetch(
        `/api/cloudflare/routes?hostname=${encodeURIComponent(hostname)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Failed to remove route');
      await mutateRoutes();
      await mutateTunnels();
      showToast(`Removed route ${hostname}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove route', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSyncPlatformService = async (serviceId: string) => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/cloudflare/services/${serviceId}/sync`, {
        method: 'POST',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to sync service route');
      await refreshPlatformAndRoutes();
      showToast('Platform service route synced', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to sync service route', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSyncAllPlatformServices = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/api/cloudflare/services/sync-all', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to sync platform services');
      await refreshPlatformAndRoutes();
      showToast('All platform service routes synced', 'success');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to sync platform services',
        'error'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const tunnelColumns: TableColumn<TunnelSummary>[] = [
    { key: 'name', header: 'name', width: '1.4fr', render: (t) => <span className="font-mono text-meta text-ink">{t.name}</span> },
    { key: 'status', header: 'status', width: '0.9fr', render: (t) => <Badge tone={tunnelTone(t.status)} withDot>{t.status}</Badge> },
    { key: 'replicas', header: 'replicas', width: '0.6fr', render: (t) => <span className="font-mono text-meta text-ink-muted">{t.replicas}</span> },
    { key: 'routes', header: 'routes', width: '0.6fr', render: (t) => <span className="font-mono text-meta text-ink-muted">{t.routes}</span> },
    {
      key: 'actions',
      header: 'actions',
      width: '160px',
      align: 'right',
      render: (t) => (
        <>
          <Button variant={t.selected ? 'primary' : 'secondary'} size="sm" onClick={() => handleSelectTunnel(t)} disabled={isBusy || t.selected}>
            {t.selected ? 'Selected' : 'Select'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleShowToken(t.id)} disabled={isBusy}>
            Token
          </Button>
        </>
      ),
    },
  ];

  const platformColumns: TableColumn<PlatformServiceStatus>[] = [
    { key: 'service', header: 'service', width: '1.1fr', render: (s) => <span className="font-display font-semibold text-field">{s.label}</span> },
    { key: 'envKey', header: 'env var', width: '1.1fr', render: (s) => <CodeToken>{s.envKey}</CodeToken> },
    {
      key: 'hostname',
      header: 'hostname',
      width: '1.3fr',
      render: (s) =>
        s.hostname.hostname ? (
          <span className="font-mono text-meta text-ink truncate block">{s.hostname.hostname}</span>
        ) : (
          <span className="font-mono text-meta text-ink-ghost">{s.required ? 'Not set' : 'Optional'}</span>
        ),
    },
    { key: 'route', header: 'route', width: '1fr', render: (s) => <Badge tone={routeTone(s.hostname.routeStatus)} withDot>{s.hostname.routeStatusLabel}</Badge> },
    { key: 'dns', header: 'dns', width: '1.2fr', render: (s) => <span className="text-field text-ink-muted">{dnsStatusLabel(s.hostname.dnsStatus)}</span> },
    {
      key: 'actions',
      header: 'actions',
      width: '110px',
      align: 'right',
      render: (s) => (
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleSyncPlatformService(s.id)}
          disabled={isBusy || !s.hostname.hostname || platformServicesData?.readiness !== 'ready'}
        >
          Sync route
        </Button>
      ),
    },
  ];

  const routeColumns: TableColumn<PublishedApplication>[] = [
    { key: 'destination', header: 'destination', width: '1.4fr', render: (r) => <span className="font-mono text-meta text-ink truncate block">{r.hostname}</span> },
    { key: 'type', header: 'type', width: '0.8fr', render: (r) => <span className="text-field text-ink-muted">{r.type}</span> },
    { key: 'service', header: 'service', width: '1fr', render: (r) => <span className="font-mono text-meta text-ink-muted">{r.service}</span> },
    { key: 'managedBy', header: 'managed by', width: '1.2fr', render: (r) => <span className="text-field text-ink-muted">{formatManagedBy(r)}</span> },
    {
      key: 'actions',
      header: 'actions',
      width: '90px',
      align: 'right',
      render: (r) =>
        r.managedBy === 'port-au-next' ? (
          <Button variant="danger" size="sm" onClick={() => handleRemoveRoute(r.hostname)} disabled={isBusy}>
            Remove
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-24">
      {!connected ? (
        <div className="flex flex-col gap-14">
          <p className="text-field text-ink-muted">
            Connect your Cloudflare account with a scoped API token. You still add domains and run
            cloudflared on your machine manually.
          </p>

          <Disclosure title="How to create an API token and find your Account ID">
            <div className="flex flex-col gap-14 text-panel text-ink-muted">
              <div>
                <div className="font-display font-semibold text-ink mb-3">1. Find your Account ID</div>
                <p>
                  Open the Cloudflare dashboard, select your account, and copy the{' '}
                  <strong className="font-semibold text-ink">Account ID</strong> from the right-hand sidebar on the account Overview
                  page.
                </p>
                <p className="mt-9">
                  <a
                    href="https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:text-primary-active"
                  >
                    Cloudflare docs: Find account and zone IDs
                  </a>
                </p>
              </div>

              <div>
                <div className="font-display font-semibold text-ink mb-3">2. Create a scoped API token</div>
                <p>
                  Go to <strong className="font-semibold text-ink">My Profile &rarr; API Tokens &rarr; Create Token</strong>. Choose{' '}
                  <strong className="font-semibold text-ink">Create Custom Token</strong> and set these permissions:
                </p>
                <div className="mt-9 bg-hover border border-line-token rounded-control overflow-x-auto">
                  <table className="w-full text-left text-panel">
                    <thead>
                      <tr className="border-b border-line-soft">
                        <th className="py-7 px-11 font-display font-semibold text-label">Type</th>
                        <th className="py-7 px-11 font-display font-semibold text-label">Item</th>
                        <th className="py-7 px-11 font-display font-semibold text-label">Permission</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-line-soft">
                        <td className="py-7 px-11">Account</td>
                        <td className="py-7 px-11">Cloudflare Tunnel</td>
                        <td className="py-7 px-11">Edit</td>
                      </tr>
                      <tr className="border-b border-line-soft">
                        <td className="py-7 px-11">Account</td>
                        <td className="py-7 px-11">Account Settings</td>
                        <td className="py-7 px-11">Read</td>
                      </tr>
                      <tr className="border-b border-line-soft">
                        <td className="py-7 px-11">Zone</td>
                        <td className="py-7 px-11">DNS</td>
                        <td className="py-7 px-11">Edit</td>
                      </tr>
                      <tr>
                        <td className="py-7 px-11">Zone</td>
                        <td className="py-7 px-11">Zone</td>
                        <td className="py-7 px-11">Read</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-9">
                  Under <strong className="font-semibold text-ink">Zone Resources</strong>, include all zones you will use, or select
                  specific zones. Port-Au-Next needs this to create tunnel routes and proxied CNAME
                  records when you assign app domains.
                </p>
                <ul className="mt-9 list-disc list-inside flex flex-col gap-3">
                  <li>
                    <a
                      href="https://dash.cloudflare.com/profile/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline hover:text-primary-active"
                    >
                      Open API Tokens in the Cloudflare dashboard
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://developers.cloudflare.com/fundamentals/api/get-started/create-token/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline hover:text-primary-active"
                    >
                      Cloudflare docs: Create an API token
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <div className="font-display font-semibold text-ink mb-3">3. Paste credentials below</div>
                <p>
                  Copy the token immediately after creation - Cloudflare only shows it once. Paste
                  the <strong className="font-semibold text-ink">Account ID</strong> and <strong className="font-semibold text-ink">API Token</strong> into the fields
                  below, then click <strong className="font-semibold text-ink">Connect Cloudflare</strong>.
                </p>
              </div>

              <div>
                <div className="font-display font-semibold text-ink mb-3">What Port-Au-Next does not do</div>
                <ul className="list-disc list-inside flex flex-col gap-3">
                  <li>Add domains to Cloudflare or change registrar nameservers</li>
                  <li>Install or run <span className="font-mono text-meta bg-surface border border-line-token rounded-badge px-5 py-1">cloudflared</span> on your machine</li>
                </ul>
                <p className="mt-9">
                  After connecting, select a tunnel, run{' '}
                  <span className="font-mono text-meta bg-surface border border-line-token rounded-badge px-5 py-1">cloudflared</span> manually, then assign hostnames
                  in app settings.
                </p>
                <p className="mt-9">
                  <a
                    href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:text-primary-active"
                  >
                    Cloudflare docs: Create and configure a tunnel
                  </a>
                </p>
              </div>
            </div>
          </Disclosure>

          {config?.envFallback && (
            <Callout tone="warning">Legacy env vars detected. Connect here to manage tunnels from the UI.</Callout>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14">
            <Input
              id="cf-account-id"
              label="Account ID"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="699d98642c564d2e855e9661899b7252"
            />
            <Input
              id="cf-api-token"
              label="API Token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Scoped token with Tunnel + DNS permissions"
              showToggle
            />
            <Input
              id="cf-origin-url"
              label="Default Service URL"
              value={tunnelOriginUrl}
              onChange={(e) => setTunnelOriginUrl(e.target.value)}
              placeholder="http://localhost"
            />
          </div>
          <div>
            <Button variant="primary" onClick={handleConnect} loading={isBusy}>
              Connect Cloudflare
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-14">
          <div className="flex flex-wrap items-center justify-between gap-10">
            <div>
              <p className="text-field text-ink-muted">
                Account <CodeToken>{config.accountId}</CodeToken>
                {config.tokenMasked ? <> &middot; Token <CodeToken>{config.tokenMasked}</CodeToken></> : ''}
              </p>
              {config.tunnelName ? (
                <p className="text-field text-ink-muted mt-3">
                  Selected tunnel: <strong className="font-semibold text-ink">{config.tunnelName}</strong>
                </p>
              ) : (
                <p className="text-field text-warning-ink mt-3">No tunnel selected yet.</p>
              )}
            </div>
            <div className="flex gap-7">
              <Button variant="secondary" onClick={handleTestConnection} loading={isBusy}>
                Test connection
              </Button>
              <Button variant="danger" onClick={handleDisconnect} disabled={isBusy}>
                Disconnect
              </Button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-10 md:items-end">
            <Input
              id="cf-origin-url-connected"
              label="Default Service URL (published applications)"
              value={tunnelOriginUrl}
              onChange={(e) => setTunnelOriginUrl(e.target.value)}
              placeholder={config.tunnelOriginUrl || 'http://localhost'}
              className="flex-1"
            />
            <Button variant="primary" onClick={handleSaveOriginUrl} loading={isBusy}>
              Save
            </Button>
          </div>
        </div>
      )}

      {connected && (
        <>
          <div>
            <div className="flex items-center justify-between gap-10 mb-11 flex-wrap">
              <div className="font-display font-semibold text-panel">Tunnels</div>
              <div className="flex gap-7">
                <Input
                  id="new-tunnel-name"
                  value={newTunnelName}
                  onChange={(e) => setNewTunnelName(e.target.value)}
                  placeholder="my-homelab-tunnel"
                  className="w-190"
                />
                <Button variant="primary" onClick={handleCreateTunnel} loading={isBusy}>
                  Create tunnel
                </Button>
              </div>
            </div>
            <div className="border border-line rounded-panel overflow-hidden">
              <Table
                columns={tunnelColumns}
                rows={tunnels}
                rowKey={(t) => t.id}
                emptyState={<div className="text-center py-24 text-ink-faint text-field">No tunnels found in this account.</div>}
              />
            </div>
          </div>

          {tunnelToken && (
            <Disclosure title="Install cloudflared (manual)">
              <p className="text-panel text-ink-muted mb-9">
                Run this on your homelab machine to connect the tunnel connector:
              </p>
              <CopyField label="Install command" value={`cloudflared service install ${tunnelToken}`} />
              <div className="mt-9 flex gap-7">
                <Button variant="secondary" size="sm" onClick={() => setTunnelToken(null)}>
                  Hide
                </Button>
              </div>
            </Disclosure>
          )}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-10 mb-11">
              <div>
                <div className="font-display font-semibold text-panel">Platform services</div>
                <p className="text-field text-ink-muted mt-3">
                  Hostnames from root <CodeToken>.env</CodeToken> (
                  <CodeToken>*_HOST</CodeToken>). Restart deployment-manager after
                  changing them. Umami syncs when <CodeToken>UMAMI_HOST</CodeToken>{' '}
                  is set; Bugsink syncs when <CodeToken>BUGSINK_HOST</CodeToken>{' '}
                  is set.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handleSyncAllPlatformServices}
                disabled={isBusy || platformServicesData?.readiness !== 'ready'}
              >
                Sync all platform services
              </Button>
            </div>
            <div className="border border-line rounded-panel overflow-hidden">
              <Table
                columns={platformColumns}
                rows={platformServices}
                rowKey={(s) => s.id}
                isLoading={!platformServicesData}
                emptyState={<div className="text-center py-24 text-ink-faint text-field">No platform services configured.</div>}
              />
            </div>
          </div>

          {selectedTunnelId && (
            <div>
              <div className="font-display font-semibold text-panel mb-11">Published applications</div>
              <div className="border border-line rounded-panel overflow-hidden">
                <Table
                  columns={routeColumns}
                  rows={routes}
                  rowKey={(r) => r.hostname}
                  emptyState={<div className="text-center py-24 text-ink-faint text-field">No published applications on this tunnel yet.</div>}
                />
              </div>
            </div>
          )}

          <Disclosure title="Setup checklist">
            <ol className="list-decimal list-inside text-panel text-ink-muted flex flex-col gap-4">
              <li>Connect API token (done)</li>
              <li>Select or create a tunnel</li>
              <li>Run cloudflared on your machine (manual)</li>
              <li>Add domain to Cloudflare dashboard (manual)</li>
              <li>Point nameservers to Cloudflare (manual)</li>
              <li>Assign hostnames in app settings - routes + DNS are automated</li>
              <li>Platform service routes sync from root <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1">.env</span> *_HOST vars (including Umami when set)</li>
            </ol>
          </Disclosure>
        </>
      )}
    </div>
  );
}
