'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { App, ServiceStatus } from '~/types';
import fetcher from '~/utils/fetcher';
import { getServiceStatusColor } from '~/utils/serviceColors';
import Badge from '~/components/general/Badge';
import Button from '~/components/general/Button';
import AppDeployButton from '~/components/buttons/AppDeployButton';
import { showToast } from '~/components/general/Toaster';
import getGithubRepoPath from '~/utils/getGithubRepoPath';

interface PreviewBranch {
  id: number;
  branch: string;
  subdomain: string;
  status: string;
  last_deployment_version?: string;
  last_deployment_commit?: string;
  last_deployment_status?: string;
  last_deployment_at?: string;
}

interface ActivePreviewBranchesProps {
  app: App;
}

export default function ActivePreviewBranches({ app }: ActivePreviewBranchesProps) {
  const { data: previewBranches, mutate } = useSWR<PreviewBranch[]>(
    `/api/apps/${app.id}/preview-branches`,
    fetcher
  );

  const handleDelete = async (branch: string) => {
    try {
      const response = await fetch(`/api/apps/${app.id}/preview-branches/${branch}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete preview branch');
      }

      await mutate();
      showToast('Preview branch deleted successfully', 'success');
    } catch (error) {
      showToast('Failed to delete preview branch', 'error');
    }
  };

  if (!previewBranches?.length) {
    return (
      <div className="text-center py-4 text-gray-500">
        No active preview branches
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 rounded-b-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Branch
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Subdomain
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Deployment
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200 rounded-b-lg">
          {previewBranches.map((previewBranch) => (
            <tr key={previewBranch.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {previewBranch.branch}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <a 
                  href={`https://${previewBranch.subdomain}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-500 hover:text-blue-700 underline"
                >
                  {previewBranch.subdomain}
                </a>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Badge color={getServiceStatusColor(previewBranch.status as ServiceStatus)} withDot>
                  {previewBranch.status}
                </Badge>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {previewBranch.last_deployment_at ? (
                  <>
                    {new Date(previewBranch.last_deployment_at).toLocaleString()}
                    {previewBranch.last_deployment_commit && (
                      <a 
                        href={`https://github.com/${getGithubRepoPath(app.repo_url)}/commit/${previewBranch.last_deployment_commit}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-500 hover:text-blue-700 underline"
                      >
                        {previewBranch.last_deployment_commit.substring(0, 7)}
                      </a>
                    )}
                  </>
                ) : (
                  'Never'
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <AppDeployButton app={app} branch={previewBranch.branch} />
                <Button
                  color="red"
                  size="sm"
                  onClick={() => handleDelete(previewBranch.branch)}
                >
                  <i className="fas fa-trash mr-2"></i>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 