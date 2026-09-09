'use client';

import { useState } from 'react';
import useSWR from 'swr';

import Switch from '~/components/general/Switch';
import Input from '~/components/general/Input';
import FieldGroup from '~/components/general/FieldGroup';
import Disclosure from '~/components/general/Disclosure';
import Callout from '~/components/general/Callout';
import { showToast } from '~/components/general/Toaster';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';

interface ErrorTrackingCardProps {
  app: App;
}

interface ErrorTrackingStatus {
  enabled: boolean;
  projectId?: string;
  projectSlug?: string;
  dsn?: string;
  dsnMasked?: string;
  dashboardUsername?: string;
  dashboardPassword?: string;
  dashboardUrl?: string;
  projectDashboardUrl?: string;
}

const REDEPLOY_MESSAGE =
  'Redeploy your app for error tracking env changes to take effect (NEXT_PUBLIC_SENTRY_DSN is set at build time).';

export default function ErrorTrackingCard({ app }: ErrorTrackingCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const { data, mutate } = useSWR<ErrorTrackingStatus>(
    `/api/apps/${app.id}/error-tracking`,
    fetcher
  );

  const enabled = data?.enabled === true;
  const hasDashboardLogin = Boolean(data?.dashboardUsername && data?.dashboardPassword);

  const handleToggle = async (next: boolean) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/error-tracking`, {
        method: next ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: next ? undefined : JSON.stringify({ enabled: false }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Failed to ${next ? 'enable' : 'disable'} error tracking`);
      }

      await mutate();
      showToast(`Error tracking ${next ? 'enabled' : 'disabled'}. ${REDEPLOY_MESSAGE}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${next ? 'enable' : 'disable'} error tracking`;
      showToast(message, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-16">
      <div className="border border-line rounded-menu overflow-hidden">
        <div className="flex items-start justify-between gap-16 px-14 py-12 bg-surface">
          <Switch
            checked={enabled}
            onChange={handleToggle}
            disabled={isUpdating || data === undefined}
            label="Error tracking (Bugsink)"
            hint="Opt-in error logging via a per-app Bugsink project and Sentry-compatible DSN."
          />
        </div>
      </div>

      {enabled && data ? (
        <div className="flex flex-col gap-14">
          <FieldGroup>
            <Input label="Project ID" value={data.projectId || ''} disabled readOnly />
            <Input label="Project slug" value={data.projectSlug || ''} disabled readOnly />
            <Input label="DSN" value={data.dsnMasked || ''} disabled readOnly />
            <Input label="Dashboard URL" value={data.dashboardUrl || ''} disabled readOnly />
            {hasDashboardLogin ? (
              <>
                <Input label="Dashboard username" value={data.dashboardUsername || ''} disabled readOnly />
                <Input label="Dashboard password" value={data.dashboardPassword || ''} disabled readOnly showToggle />
              </>
            ) : null}
          </FieldGroup>

          <Disclosure title="Add error tracking to your Next.js app">
            <p className="text-panel text-ink-muted mb-9">
              These env vars are injected on production deploy when error tracking is enabled:
            </p>
            <div className="bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink mb-9">
              SENTRY_DSN
              <br />
              NEXT_PUBLIC_SENTRY_DSN
              <br />
              SENTRY_ENVIRONMENT
            </div>
            <p className="text-panel text-ink-muted mt-9 mb-9">
              Install <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1">@sentry/nextjs</span> and add Sentry config files. The SDK reads{' '}
              <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1">SENTRY_DSN</span> automatically:
            </p>
            <div className="bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink overflow-x-auto whitespace-pre">
              {`npm install @sentry/nextjs

// instrumentation.ts
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;

// instrumentation-client.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0,
});`}
            </div>
            <p className="text-panel text-ink-muted mt-9">
              {hasDashboardLogin
                ? 'Use the dashboard username and password above to sign in at the dashboard URL and view this app’s errors.'
                : 'Use the platform admin login at the dashboard URL to view this app’s errors.'}
            </p>
          </Disclosure>
        </div>
      ) : data && !enabled && data.projectId ? (
        <Callout tone="info">
          Error tracking is disabled. Bugsink project, dashboard login, and DSN are retained.
          Enable again to resume env injection without reprovisioning.
        </Callout>
      ) : (
        <Callout tone="info">
          Error tracking is not enabled. Enable to provision an isolated Bugsink team, project,
          dashboard login, and DSN for this app.
        </Callout>
      )}
    </div>
  );
}
