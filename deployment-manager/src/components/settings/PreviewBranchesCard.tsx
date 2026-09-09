'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AppFeature } from '~/types/appFeatures';
import fetcher from '~/utils/fetcher';
import Switch from '~/components/general/Switch';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { showToast } from '~/components/general/Toaster';
import { App } from '~/types';
import Disclosure from '~/components/general/Disclosure';

interface PreviewBranchesCardProps {
  app: App;
  initialPreviewDomain?: string;
}

export default function PreviewBranchesCard({ app, initialPreviewDomain }: PreviewBranchesCardProps) {
  const [previewDomain, setPreviewDomain] = useState(initialPreviewDomain || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: features, mutate: mutateFeatures } = useSWR(
    `/api/apps/${app.id}/features`,
    fetcher
  );

  const isEnabled = features?.[AppFeature.PREVIEW_BRANCHES]?.enabled || false;

  const handleToggle = async (next: boolean) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/features`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feature: AppFeature.PREVIEW_BRANCHES,
          enabled: next,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update feature');
      }

      await mutateFeatures();
      showToast(`Preview Branches ${next ? 'enabled' : 'disabled'} successfully`, 'success');
    } catch {
      showToast('Failed to update Preview Branches feature', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePreviewDomain = async () => {
    if (!previewDomain) {
      showToast('Please enter a preview domain', 'warning');
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/preview-domain`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          previewDomain,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update preview domain');
      }

      showToast('Preview domain updated successfully', 'success');
    } catch {
      showToast('Failed to update preview domain', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-16">
      <div className="border border-line rounded-menu overflow-hidden">
        <div className="flex items-start justify-between gap-16 px-14 py-12 bg-surface">
          <Switch
            checked={isEnabled}
            onChange={handleToggle}
            disabled={isUpdating}
            label="Preview Branches"
            hint="Enable preview deployments for feature branches with separate databases and subdomains."
          />
        </div>
      </div>

      {isEnabled && (
        <div className="flex flex-col gap-16">
          <div>
            <div className="flex items-end gap-10">
              <Input
                type="text"
                label="Preview Domain"
                id="preview-domain"
                value={previewDomain}
                onChange={(e) => setPreviewDomain(e.target.value)}
                placeholder={`preview.${app.domain}`}
                className="flex-1"
              />
              <Button variant="primary" onClick={handleUpdatePreviewDomain} loading={isUpdating}>
                Update
              </Button>
            </div>
            <p className="text-mini text-ink-faint mt-9 leading-[1.6]">
              We will use subdomains from your domain to access preview branches.<br />
              For example, <span className="font-mono text-meta">{previewDomain ? `dev.${previewDomain}` : `dev.preview.${app.domain}`}</span> will be used to access <span className="font-mono text-meta">dev</span> branch.<br />
              And <span className="font-mono text-meta">{previewDomain ? `pr-123.${previewDomain}` : `pr-123.preview.${app.domain}`}</span> will be used to access <span className="font-mono text-meta">pr-123</span> branch.
            </p>
          </div>

          <Disclosure title="DNS & tunnel">
            <p className="text-panel text-ink-muted">
              When Cloudflare is connected in Settings, saving the preview domain creates a wildcard
              tunnel route and proxied CNAME for:
            </p>
            <div className="mt-9 bg-hover border border-line-token rounded-control p-11 font-mono text-meta text-ink">
              *.{previewDomain.replace(/^\*\./g, '') || `preview.${app.domain}`}
            </div>
            <p className="mt-9 text-panel text-ink-muted">
              The domain must already exist in your Cloudflare account with active nameservers.
            </p>
          </Disclosure>
        </div>
      )}
    </div>
  );
}
