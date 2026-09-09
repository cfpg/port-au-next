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
  const enabled = data?.enabled === true;

  const handleToggle = async (next: boolean) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/analytics`, {
        method: next ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: next ? undefined : JSON.stringify({ enabled: false }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Failed to ${next ? 'enable' : 'disable'} analytics`);
      }

      await mutate();
      showToast(`Analytics ${next ? 'enabled' : 'disabled'}. ${REDEPLOY_MESSAGE}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to ${next ? 'enable' : 'disable'} analytics`;
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
            label="Analytics (Umami)"
            hint="Opt-in privacy-focused analytics with a per-app Umami dashboard login."
          />
        </div>
      </div>

      {enabled && data ? (
        <div className="flex flex-col gap-14">
          <FieldGroup>
            <Input label="Website ID" value={data.websiteId || ''} disabled readOnly />
            <Input label="Dashboard URL" value={data.dashboardUrl || ''} disabled readOnly />
            <Input label="Dashboard username" value={data.dashboardUsername || ''} disabled readOnly />
            <Input label="Dashboard password" value={data.dashboardPassword || ''} disabled readOnly showToggle />
          </FieldGroup>

          <Disclosure title="Add tracking to your Next.js app">
            <p className="text-panel text-ink-muted mb-9">
              These env vars are injected on production deploy when analytics is enabled:
            </p>
            <div className="bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink mb-9">
              NEXT_PUBLIC_UMAMI_HOST
              <br />
              NEXT_PUBLIC_UMAMI_WEBSITE_ID
            </div>
            <p className="text-panel text-ink-muted mt-9 mb-9">
              Add this component to your root <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1">layout.tsx</span>:
            </p>
            <div className="bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink overflow-x-auto whitespace-pre">
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
            </div>
            <p className="text-panel text-ink-muted mt-9">
              Cookie banners and privacy notices are your responsibility once you add tracking.
            </p>
          </Disclosure>

          <Disclosure title="If you use Content-Security-Policy">
            <p className="text-panel text-ink-muted mb-9">
              Allow your Umami host in <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1">script-src</span> and <span className="font-mono text-meta bg-hover border border-line-token rounded-badge px-5 py-1">connect-src</span> if
              responses include a CSP header, for example:
            </p>
            <div className="bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink">
              script-src &apos;self&apos; https://your-analytics-host;
              <br />
              connect-src &apos;self&apos; https://your-analytics-host;
            </div>
          </Disclosure>
        </div>
      ) : data && !enabled && data.websiteId ? (
        <Callout tone="info">
          Analytics is disabled. Umami data and dashboard login are retained. Enable again to
          resume env injection without reprovisioning.
        </Callout>
      ) : (
        <Callout tone="info">
          Analytics is not enabled. Enable to provision an isolated Umami team, website, and
          dashboard login for this app.
        </Callout>
      )}
    </div>
  );
}
