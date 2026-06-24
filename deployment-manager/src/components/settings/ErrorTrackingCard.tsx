'use client';

import { useState } from 'react';
import useSWR from 'swr';

import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import SettingsInstructionsToggleable from '~/components/general/SettingsInstructionsToggleable';
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

  const handleEnable = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/error-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to enable error tracking');
      }

      await mutate();
      showToast(`Error tracking enabled. ${REDEPLOY_MESSAGE}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enable error tracking';
      showToast(message, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDisable = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/error-tracking`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to disable error tracking');
      }

      await mutate();
      showToast(`Error tracking disabled. ${REDEPLOY_MESSAGE}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disable error tracking';
      showToast(message, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const enabled = data?.enabled === true;
  const hasDashboardLogin = Boolean(data?.dashboardUsername && data?.dashboardPassword);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Error tracking (Bugsink)</h3>
          <p className="text-sm text-gray-500">
            Opt-in error logging via a per-app Bugsink project and Sentry-compatible DSN
          </p>
        </div>
        {!enabled ? (
          <Button color="green" onClick={handleEnable} disabled={isUpdating}>
            Enable
          </Button>
        ) : (
          <Button color="red" onClick={handleDisable} disabled={isUpdating}>
            Disable
          </Button>
        )}
      </div>

      {enabled && data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Project ID" value={data.projectId || ''} disabled readOnly />
            <Input label="Project slug" value={data.projectSlug || ''} disabled readOnly />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="DSN" value={data.dsnMasked || ''} disabled readOnly />
            <Input
              label="Dashboard URL"
              value={data.dashboardUrl || ''}
              disabled
              readOnly
            />
          </div>
          {hasDashboardLogin ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Dashboard username"
                value={data.dashboardUsername || ''}
                disabled
                readOnly
              />
              <Input
                label="Dashboard password"
                value={data.dashboardPassword || ''}
                disabled
                readOnly
                showToggle
              />
            </div>
          ) : null}

          <SettingsInstructionsToggleable title="Add error tracking to your Next.js app">
            <p className="text-sm text-blue-700 mb-2">
              These env vars are injected on production deploy when error tracking is enabled:
            </p>
            <div className="bg-white p-3 rounded border border-blue-200">
              <code className="text-sm">
                SENTRY_DSN
                <br />
                NEXT_PUBLIC_SENTRY_DSN
                <br />
                SENTRY_ENVIRONMENT
              </code>
            </div>
            <p className="text-sm text-blue-700 mt-3 mb-2">
              Install <code>@sentry/nextjs</code> and add Sentry config files. The SDK reads{' '}
              <code>SENTRY_DSN</code> automatically:
            </p>
            <div className="bg-white p-3 rounded border border-blue-200 overflow-x-auto">
              <code className="text-sm whitespace-pre">
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
              </code>
            </div>
            <p className="text-sm text-blue-700 mt-3">
              {hasDashboardLogin
                ? 'Use the dashboard username and password above to sign in at the dashboard URL and view this app\u2019s errors.'
                : 'Use the platform admin login at the dashboard URL to view this app\u2019s errors.'}
            </p>
          </SettingsInstructionsToggleable>
        </div>
      ) : data && !enabled && data.projectId ? (
        <div className="bg-gray-50 p-4 rounded-md">
          <p className="text-sm text-gray-600">
            Error tracking is disabled. Bugsink project, dashboard login, and DSN are retained.
            Enable again to resume env injection without reprovisioning.
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-md">
          <p className="text-sm text-gray-600">
            Error tracking is not enabled. Enable to provision an isolated Bugsink team, project,
            dashboard login, and DSN for this app.
          </p>
        </div>
      )}
    </div>
  );
}
