'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import Button from '~/components/general/Button';
import Link from '~/components/general/Link';
import Callout from '~/components/general/Callout';
import CodeToken from '~/components/general/CodeToken';
import Switch from '~/components/general/Switch';
import { showToast } from '~/components/general/Toaster';
import getSingleAppPath from '~/utils/getSingleAppPath';
import { AppFeature } from '~/types/appFeatures';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';

interface GithubAppCardProps {
  app: App;
}

interface AppGithubStatus {
  connected: boolean;
  accountLogin?: string;
  repoFullName?: string;
  hasLocalCheckout?: boolean;
  autoDeployEnabled?: boolean;
}

export default function GithubAppCard({ app }: GithubAppCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, mutate, isLoading } = useSWR<AppGithubStatus>(`/api/apps/${app.id}/github`, fetcher);
  const [isBusy, setIsBusy] = useState(false);

  // Surfaces the result of the connect callback's redirect (?github=connected|error) once,
  // then strips it from the URL so a refresh doesn't re-show the toast.
  useEffect(() => {
    const result = searchParams.get('github');
    if (!result) return;

    if (result === 'connected') {
      showToast('GitHub connected', 'success');
      void mutate();
    } else if (result === 'error') {
      showToast(searchParams.get('message') || 'Failed to connect GitHub', 'error');
    }

    router.replace(`/apps/${app.name}/settings`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnect = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/github/connect`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to start GitHub connection');
      window.location.href = payload.url;
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to start GitHub connection', 'error');
      setIsBusy(false);
    }
  };

  const handleDiscover = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/github/discover`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No matching installation found');
      await mutate();
      showToast(`Connected as ${payload.accountLogin}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to check for an existing installation', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleAutoDeploy = async (next: boolean) => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: AppFeature.AUTO_DEPLOY, enabled: next }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to update Auto-deploy');
      await mutate();
      showToast(`Auto-deploy ${next ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to update Auto-deploy', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/github`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to disconnect GitHub');
      await mutate();
      showToast('GitHub disconnected', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to disconnect', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return <p className="text-panel text-ink-faint">Loading GitHub connection status…</p>;
  }

  return (
    <div className="flex flex-col gap-14">
      <p className="text-panel text-ink-muted">
        Connect this app to a GitHub repository so the manual Deploy button can pull it with
        short-lived credentials - useful for private repositories. Connecting alone does not
        trigger deployments; enable Auto-deploy below once connected to also queue a deployment
        whenever GitHub delivers a push.
      </p>

      {!data?.connected ? (
        <div className="flex flex-col gap-9">
          <div className="flex flex-wrap items-center gap-10">
            <Button variant="primary" onClick={handleConnect} loading={isBusy}>
              Connect GitHub
            </Button>
            <Button variant="secondary" onClick={handleDiscover} disabled={isBusy}>
              Check for existing installation
            </Button>
          </div>
          <p className="text-mini text-ink-faint">
            Already installed the App on GitHub for this repository (e.g. from a previous attempt)?
            &quot;Check for existing installation&quot; connects it directly, without going through GitHub again.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-14">
          <div className="flex flex-wrap items-center justify-between gap-10">
            <p className="text-field text-ink-muted">
              Connected as <CodeToken>{data.accountLogin}</CodeToken> &middot;{' '}
              <CodeToken>{data.repoFullName}</CodeToken>
            </p>
            <Button variant="danger" size="sm" onClick={handleDisconnect} disabled={isBusy}>
              Disconnect
            </Button>
          </div>

          {!data.hasLocalCheckout && (
            <Callout tone="warning">
              Repository connected, but this app hasn&apos;t been built yet. Go to{' '}
              <Link href={getSingleAppPath(app.name)} variant="default" className="underline font-medium">
                {app.name}
              </Link>{' '}
              and click <strong className="font-semibold">Deploy</strong> to clone and build it for
              the first time.
            </Callout>
          )}

          <div className="border border-line rounded-menu overflow-hidden">
            <div className="flex items-start justify-between gap-16 px-14 py-12 bg-surface">
              <Switch
                checked={data.autoDeployEnabled ?? false}
                onChange={handleToggleAutoDeploy}
                disabled={isBusy}
                label="Auto-deploy"
                hint={
                  <>
                    A push to <CodeToken>{app.branch}</CodeToken> queues a normal deployment. A
                    push to any other branch queues an isolated preview deployment, but only when
                    Preview Branches is enabled for this app with a preview domain configured -
                    otherwise that push is ignored. Every deployment (manual or automatic) shares
                    the same global queue, so it may wait behind other work. Disabling this stops
                    new pushes from being queued; a push already accepted keeps running.
                  </>
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
