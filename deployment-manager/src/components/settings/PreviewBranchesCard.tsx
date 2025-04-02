'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { AppFeature } from '~/types/appFeatures';
import fetcher from '~/utils/fetcher';
import Button from '~/components/general/Button';
import Input from '~/components/general/Input';
import { useToast } from '~/components/general/ToastContainer';

interface PreviewBranchesCardProps {
  appId: number;
  appName: string;
  initialPreviewDomain?: string;
}

export default function PreviewBranchesCard({ appId, appName, initialPreviewDomain }: PreviewBranchesCardProps) {
  const { showToast } = useToast();
  const [previewDomain, setPreviewDomain] = useState(initialPreviewDomain || '');
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: features, mutate: mutateFeatures } = useSWR(
    `/api/apps/${appId}/features`,
    fetcher
  );

  const isEnabled = features?.[AppFeature.PREVIEW_BRANCHES]?.enabled || false;

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/apps/${appId}/features`, {
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
      const response = await fetch(`/api/apps/${appId}/preview-domain`, {
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
            <label htmlFor="preview-domain" className="block text-sm font-medium text-gray-700">
              Preview Domain
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <Input
                type="text"
                id="preview-domain"
                value={previewDomain}
                onChange={(e) => setPreviewDomain(e.target.value)}
                placeholder={`*.${appName}.example.com`}
                className="flex-1"
              />
              <Button
                color="blue"
                onClick={handleUpdatePreviewDomain}
                disabled={isUpdating}
                className="ml-2"
              >
                Update
              </Button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              This domain will be used for all preview branch deployments
            </p>
          </div>

          <div className="bg-blue-50 p-4 rounded-md">
            <h4 className="text-sm font-medium text-blue-800 mb-2">DNS Configuration Required</h4>
            <p className="text-sm text-blue-700">
              To enable preview branches, you need to add a wildcard DNS record:
            </p>
            <div className="mt-2 bg-white p-3 rounded border border-blue-200">
              <code className="text-sm">
                *.{previewDomain || `${appName}.example.com`} IN A {process.env.NEXT_PUBLIC_DEPLOYMENT_MANAGER_HOST}
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