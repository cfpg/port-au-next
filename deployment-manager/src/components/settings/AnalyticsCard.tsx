'use client';

import { useState } from 'react';
import useSWR from 'swr';

import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import SettingsInstructionsToggleable from '~/components/general/SettingsInstructionsToggleable';
import { showToast } from '~/components/general/Toaster';
import { App } from '~/types';
import fetcher from '~/utils/fetcher';

interface AnalyticsCardProps {
  app: App;
}

interface AnalyticsStatus {
  enabled: boolean;
  websiteId?: string;
  dashboardUsername?: string;
  dashboardPassword?: string;
  dashboardUrl?: string;
}

const REDEPLOY_MESSAGE =
  'Redeploy your app for analytics env changes to take effect (NEXT_PUBLIC_* vars are set at build time).';

export default function AnalyticsCard({ app }: AnalyticsCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const { data, mutate } = useSWR<AnalyticsStatus>(`/api/apps/${app.id}/analytics`, fetcher);

  const handleEnable = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to enable analytics');
      }

      await mutate();
      showToast(`Analytics enabled. ${REDEPLOY_MESSAGE}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enable analytics';
      showToast(message, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDisable = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/analytics`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to disable analytics');
      }

      await mutate();
      showToast(`Analytics disabled. ${REDEPLOY_MESSAGE}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to disable analytics';
      showToast(message, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const enabled = data?.enabled === true;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Analytics (Umami)</h3>
          <p className="text-sm text-gray-500">
            Opt-in privacy-focused analytics with a per-app Umami dashboard login
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
            <Input label="Website ID" value={data.websiteId || ''} disabled readOnly />
            <Input label="Dashboard URL" value={data.dashboardUrl || ''} disabled readOnly />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Dashboard username" value={data.dashboardUsername || ''} disabled readOnly />
            <Input
              label="Dashboard password"
              value={data.dashboardPassword || ''}
              disabled
              readOnly
              showToggle
            />
          </div>

          <SettingsInstructionsToggleable title="Add tracking to your Next.js app">
            <p className="text-sm text-blue-700 mb-2">
              These env vars are injected on production deploy when analytics is enabled:
            </p>
            <div className="bg-white p-3 rounded border border-blue-200">
              <code className="text-sm">
                NEXT_PUBLIC_UMAMI_HOST
                <br />
                NEXT_PUBLIC_UMAMI_WEBSITE_ID
              </code>
            </div>
            <p className="text-sm text-blue-700 mt-3 mb-2">
              Add this component to your root <code>layout.tsx</code>:
            </p>
            <div className="bg-white p-3 rounded border border-blue-200 overflow-x-auto">
              <code className="text-sm whitespace-pre">
                {`import Script from 'next/script';

export function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const host = process.env.NEXT_PUBLIC_UMAMI_HOST;
  if (!websiteId || !host) return null;

  return (
    <Script
      src={\`\${host}/script.js\`}
      data-website-id={websiteId}
      strategy="afterInteractive"
    />
  );
}`}
              </code>
            </div>
            <p className="text-sm text-blue-700 mt-3">
              Cookie banners and privacy notices are your responsibility once you add tracking.
            </p>
          </SettingsInstructionsToggleable>

          <SettingsInstructionsToggleable title="If you use Content-Security-Policy">
            <p className="text-sm text-blue-700">
              Allow your Umami host in <code>script-src</code> and <code>connect-src</code> if
              responses include a CSP header, for example:
            </p>
            <div className="mt-2 bg-white p-3 rounded border border-blue-200">
              <code className="text-sm">
                script-src &apos;self&apos; https://your-analytics-host;
                <br />
                connect-src &apos;self&apos; https://your-analytics-host;
              </code>
            </div>
          </SettingsInstructionsToggleable>
        </div>
      ) : data && !enabled && data.websiteId ? (
        <div className="bg-gray-50 p-4 rounded-md">
          <p className="text-sm text-gray-600">
            Analytics is disabled. Umami data and dashboard login are retained. Enable again to
            resume env injection without reprovisioning.
          </p>
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-md">
          <p className="text-sm text-gray-600">
            Analytics is not enabled. Enable to provision an isolated Umami team, website, and
            dashboard login for this app.
          </p>
        </div>
      )}
    </div>
  );
}
