'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { showToast } from '~/components/general/Toaster';
import SettingsInstructionsToggleable from '~/components/general/SettingsInstructionsToggleable';
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

function routeStatusBadgeClass(routeStatus: string): string {
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
    default:
      return 'bg-gray-100 text-gray-700';
  }
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

function tunnelStatusBadgeClass(status: string): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-100 text-green-800';
    case 'degraded':
      return 'bg-yellow-100 text-yellow-800';
    case 'down':
    case 'inactive':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
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
      showToast(`Connected — ${payload.tunnelCount ?? 0} tunnel(s) found`, 'success');
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
      showToast('Tunnel created — install cloudflared with the token below', 'success');
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

  const copyToken = async () => {
    if (!tunnelToken) return;
    await navigator.clipboard.writeText(tunnelToken);
    showToast('Tunnel token copied', 'success');
  };

  return (
    <div className="space-y-8">
      {!connected ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Connect your Cloudflare account with a scoped API token. You still add domains and run
            cloudflared on your machine manually.
          </p>

          <SettingsInstructionsToggleable
            title="How to create an API token and find your Account ID"
            expandedMaxHeightClass="max-h-[1200px]"
          >
            <div className="space-y-4 text-sm text-blue-700">
              <div>
                <h4 className="font-medium text-blue-900 mb-1">1. Find your Account ID</h4>
                <p>
                  Open the Cloudflare dashboard, select your account, and copy the{' '}
                  <strong>Account ID</strong> from the right-hand sidebar on the account Overview
                  page.
                </p>
                <p className="mt-2">
                  <a
                    href="https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-800 underline hover:text-blue-950"
                  >
                    Cloudflare docs: Find account and zone IDs
                  </a>
                </p>
              </div>

              <div>
                <h4 className="font-medium text-blue-900 mb-1">2. Create a scoped API token</h4>
                <p>
                  Go to <strong>My Profile → API Tokens → Create Token</strong>. Choose{' '}
                  <strong>Create Custom Token</strong> and set these permissions:
                </p>
                <div className="mt-2 bg-white p-3 rounded border border-blue-200 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-blue-100">
                        <th className="py-1 pr-4 font-medium">Type</th>
                        <th className="py-1 pr-4 font-medium">Item</th>
                        <th className="py-1 font-medium">Permission</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-blue-50">
                        <td className="py-1 pr-4">Account</td>
                        <td className="py-1 pr-4">Cloudflare Tunnel</td>
                        <td className="py-1">Edit</td>
                      </tr>
                      <tr className="border-b border-blue-50">
                        <td className="py-1 pr-4">Account</td>
                        <td className="py-1 pr-4">Account Settings</td>
                        <td className="py-1">Read</td>
                      </tr>
                      <tr className="border-b border-blue-50">
                        <td className="py-1 pr-4">Zone</td>
                        <td className="py-1 pr-4">DNS</td>
                        <td className="py-1">Edit</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4">Zone</td>
                        <td className="py-1 pr-4">Zone</td>
                        <td className="py-1">Read</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2">
                  Under <strong>Zone Resources</strong>, include all zones you will use, or select
                  specific zones. Port-Au-Next needs this to create tunnel routes and proxied CNAME
                  records when you assign app domains.
                </p>
                <ul className="mt-2 list-disc list-inside space-y-1">
                  <li>
                    <a
                      href="https://dash.cloudflare.com/profile/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-800 underline hover:text-blue-950"
                    >
                      Open API Tokens in the Cloudflare dashboard
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://developers.cloudflare.com/fundamentals/api/get-started/create-token/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-800 underline hover:text-blue-950"
                    >
                      Cloudflare docs: Create an API token
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-blue-900 mb-1">3. Paste credentials below</h4>
                <p>
                  Copy the token immediately after creation — Cloudflare only shows it once. Paste
                  the <strong>Account ID</strong> and <strong>API Token</strong> into the fields
                  below, then click <strong>Connect Cloudflare</strong>.
                </p>
              </div>

              <div>
                <h4 className="font-medium text-blue-900 mb-1">What Port-Au-Next does not do</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>Add domains to Cloudflare or change registrar nameservers</li>
                  <li>Install or run <code className="text-blue-900">cloudflared</code> on your machine</li>
                </ul>
                <p className="mt-2">
                  After connecting, select a tunnel, run{' '}
                  <code className="text-blue-900">cloudflared</code> manually, then assign hostnames
                  in app settings.
                </p>
                <p className="mt-2">
                  <a
                    href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel-api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-800 underline hover:text-blue-950"
                  >
                    Cloudflare docs: Create and configure a tunnel
                  </a>
                </p>
              </div>
            </div>
          </SettingsInstructionsToggleable>

          {config?.envFallback && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
              Legacy env vars detected. Connect here to manage tunnels from the UI.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              type="password"
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
          <div className="flex gap-2">
            <Button color="green" onClick={handleConnect} disabled={isBusy}>
              Connect Cloudflare
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-600">
                Account <span className="font-mono">{config.accountId}</span>
                {config.tokenMasked ? ` · Token ${config.tokenMasked}` : ''}
              </p>
              {config.tunnelName ? (
                <p className="text-sm text-gray-600">
                  Selected tunnel: <strong>{config.tunnelName}</strong>
                </p>
              ) : (
                <p className="text-sm text-amber-700">No tunnel selected yet.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button color="gray" onClick={handleTestConnection} disabled={isBusy}>
                Test connection
              </Button>
              <Button color="red" onClick={handleDisconnect} disabled={isBusy}>
                Disconnect
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
            <Input
              id="cf-origin-url-connected"
              label="Default Service URL (published applications)"
              value={tunnelOriginUrl}
              onChange={(e) => setTunnelOriginUrl(e.target.value)}
              placeholder={config.tunnelOriginUrl || 'http://localhost'}
            />
            <Button color="blue" onClick={handleSaveOriginUrl} disabled={isBusy}>
              Save
            </Button>
          </div>
        </div>
      )}

      {connected && (
        <>
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-medium">Tunnels</h4>
              <div className="flex gap-2">
                <Input
                  id="new-tunnel-name"
                  value={newTunnelName}
                  onChange={(e) => setNewTunnelName(e.target.value)}
                  placeholder="my-homelab-tunnel"
                  className="w-48"
                />
                <Button color="blue" onClick={handleCreateTunnel} disabled={isBusy}>
                  Create tunnel
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Replicas</th>
                    <th className="px-4 py-2 font-medium">Routes</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tunnels.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-gray-500 text-center">
                        No tunnels found in this account.
                      </td>
                    </tr>
                  ) : (
                    tunnels.map((tunnel) => (
                      <tr
                        key={tunnel.id}
                        className={tunnel.selected ? 'bg-blue-50' : 'border-t border-gray-100'}
                      >
                        <td className="px-4 py-2 font-medium">{tunnel.name}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tunnelStatusBadgeClass(tunnel.status)}`}
                          >
                            {tunnel.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">{tunnel.replicas}</td>
                        <td className="px-4 py-2">{tunnel.routes}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              color={tunnel.selected ? 'green' : 'gray-light'}
                              size="sm"
                              onClick={() => handleSelectTunnel(tunnel)}
                              disabled={isBusy || tunnel.selected}
                            >
                              {tunnel.selected ? 'Selected' : 'Select'}
                            </Button>
                            <Button
                              color="gray-light"
                              size="sm"
                              onClick={() => handleShowToken(tunnel.id)}
                              disabled={isBusy}
                            >
                              Token
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {tunnelToken && (
            <SettingsInstructionsToggleable title="Install cloudflared (manual)">
              <p className="text-sm text-gray-700 mb-2">
                Run this on your homelab machine to connect the tunnel connector:
              </p>
              <div className="bg-gray-900 text-gray-100 p-3 rounded text-sm font-mono break-all">
                cloudflared service install {tunnelToken}
              </div>
              <div className="mt-2 flex gap-2">
                <Button color="gray-light" size="sm" onClick={copyToken}>
                  Copy token
                </Button>
                <Button color="gray-light" size="sm" onClick={() => setTunnelToken(null)}>
                  Hide
                </Button>
              </div>
            </SettingsInstructionsToggleable>
          )}

          {connected && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-lg font-medium">Platform services</h4>
                  <p className="text-sm text-gray-600">
                    Hostnames from root <code className="text-gray-800">.env</code> (
                    <code className="text-gray-800">*_HOST</code>). Restart deployment-manager after
                    changing them. Umami syncs when <code className="text-gray-800">UMAMI_HOST</code>{' '}
                    is set; Bugsink syncs when <code className="text-gray-800">BUGSINK_HOST</code>{' '}
                    is set.
                  </p>
                </div>
                <Button
                  color="blue"
                  onClick={handleSyncAllPlatformServices}
                  disabled={isBusy || platformServicesData?.readiness !== 'ready'}
                >
                  Sync all platform services
                </Button>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-lg mb-8">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Service</th>
                      <th className="px-4 py-2 font-medium">Env var</th>
                      <th className="px-4 py-2 font-medium">Hostname</th>
                      <th className="px-4 py-2 font-medium">Route</th>
                      <th className="px-4 py-2 font-medium">DNS</th>
                      <th className="px-4 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformServices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-gray-500 text-center">
                          Loading platform services…
                        </td>
                      </tr>
                    ) : (
                      platformServices.map((service) => (
                        <tr key={service.id} className="border-t border-gray-100">
                          <td className="px-4 py-2 font-medium">{service.label}</td>
                          <td className="px-4 py-2 font-mono text-xs">{service.envKey}</td>
                          <td className="px-4 py-2 font-mono">
                            {service.hostname.hostname ?? (
                              <span className="text-gray-500">
                                {service.required ? 'Not set' : 'Optional — not set'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${routeStatusBadgeClass(service.hostname.routeStatus)}`}
                            >
                              {service.hostname.routeStatusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-2">{dnsStatusLabel(service.hostname.dnsStatus)}</td>
                          <td className="px-4 py-2">
                            <Button
                              color="blue"
                              size="sm"
                              onClick={() => handleSyncPlatformService(service.id)}
                              disabled={
                                isBusy ||
                                !service.hostname.hostname ||
                                platformServicesData?.readiness !== 'ready'
                              }
                            >
                              Sync route
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedTunnelId && (
            <div>
              <h4 className="text-lg font-medium mb-3">Published applications</h4>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Destination</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Service</th>
                      <th className="px-4 py-2 font-medium">Managed by</th>
                      <th className="px-4 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-gray-500 text-center">
                          No published applications on this tunnel yet.
                        </td>
                      </tr>
                    ) : (
                      routes.map((route) => (
                        <tr key={route.hostname} className="border-t border-gray-100">
                          <td className="px-4 py-2 font-mono">{route.hostname}</td>
                          <td className="px-4 py-2">{route.type}</td>
                          <td className="px-4 py-2 font-mono">{route.service}</td>
                          <td className="px-4 py-2">{formatManagedBy(route)}</td>
                          <td className="px-4 py-2">
                            {route.managedBy === 'port-au-next' && (
                              <Button
                                color="red"
                                size="sm"
                                onClick={() => handleRemoveRoute(route.hostname)}
                                disabled={isBusy}
                              >
                                Remove
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <SettingsInstructionsToggleable title="Setup checklist">
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
              <li>Connect API token (done)</li>
              <li>Select or create a tunnel</li>
              <li>Run cloudflared on your machine (manual)</li>
              <li>Add domain to Cloudflare dashboard (manual)</li>
              <li>Point nameservers to Cloudflare (manual)</li>
              <li>Assign hostnames in app settings — routes + DNS are automated</li>
              <li>Platform service routes sync from root <code>.env</code> *_HOST vars (including Umami when set)</li>
            </ol>
          </SettingsInstructionsToggleable>
        </>
      )}
    </div>
  );
}
