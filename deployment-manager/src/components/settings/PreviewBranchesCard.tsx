'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { AppFeature } from '~/types/appFeatures';
import fetcher from '~/utils/fetcher';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { useToast } from '~/components/general/ToastContainer';
import { App } from '~/types';

interface PreviewBranchesCardProps {
  app: App;
  initialPreviewDomain?: string;
}

export default function PreviewBranchesCard({ app, initialPreviewDomain }: PreviewBranchesCardProps) {
  const { showToast } = useToast();
  const [previewDomain, setPreviewDomain] = useState(initialPreviewDomain || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: features, mutate: mutateFeatures } = useSWR(
    `/api/apps/${app.id}/features`,
    fetcher
  );

  const isEnabled = features?.[AppFeature.PREVIEW_BRANCHES]?.enabled || false;

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${app.id}/features`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feature: AppFeature.PREVIEW_BRANCHES,
          enabled: !isEnabled,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update feature');
      }

      await mutateFeatures();
      showToast(`Preview Branches ${!isEnabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      showToast('Failed to update Preview Branches feature');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePreviewDomain = async () => {
    if (!previewDomain) {
      showToast('Please enter a preview domain');
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

      showToast('Preview domain updated successfully');
    } catch (error) {
      showToast('Failed to update preview domain');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Preview Branches</h3>
          <p className="text-sm text-gray-500">
            Enable preview deployments for feature branches with separate databases and subdomains
          </p>
        </div>
        <Button
          color={isEnabled ? 'green' : 'gray'}
          onClick={handleToggle}
          disabled={isUpdating}
        >
          {isEnabled ? 'Enabled' : 'Disabled'}
        </Button>
      </div>

      {isEnabled && (
        <div className="space-y-6">
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                type="text"
                label="Preview Domain"
                id="preview-domain"
                value={previewDomain}
                onChange={(e) => setPreviewDomain(e.target.value)}
                placeholder={`preview.${app.domain}`}
                className="flex-1"
              />
              <div className="flex items-end">
                <Button
                  color="blue"
                  onClick={handleUpdatePreviewDomain}
                  disabled={isUpdating}
                >
                  Update
                </Button>
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              We will use subdomains from your domain to access preview branches.<br />
              For example, <i>{previewDomain ? `dev.${previewDomain}` : `dev.preview.${app.domain}`}</i> will be used to access <i>dev</i> branch.<br />
              And <i>{previewDomain ? `pr-123.${previewDomain}` : `pr-123.preview.${app.domain}`}</i> will be used to access <i>pr-123</i> branch.
            </p>
          </div>

          <div className="bg-blue-50 p-4 rounded-md">
            <h4 className="text-sm font-medium text-blue-800 mb-2">DNS Configuration Required</h4>
            <p className="text-sm text-blue-700">
              To enable preview branches, you need to add a wildcard DNS record:
            </p>
            <div className="mt-2 bg-white p-3 rounded border border-blue-200">
              <code className="text-sm">
                *.{previewDomain.replace(/^\*\./g, '') || `preview.${app.domain}`} IN CNAME {process.env.NEXT_PUBLIC_DEPLOYMENT_MANAGER_HOST}
              </code>
            </div>
            <p className="mt-2 text-sm text-blue-700">
              This will allow preview branches to be accessed via their own subdomains.
            </p>
          </div>
        </div>
      )}
    </div>
  );
} 