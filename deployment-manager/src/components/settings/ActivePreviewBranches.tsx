'use client';

import useSWR from 'swr';
import { App, ServiceStatus } from '~/types';
import fetcher from '~/utils/fetcher';
import { getServiceStatusColor } from '~/utils/serviceColors';
import Badge from '~/components/general/Badge';
import AppDeployButton from '~/components/buttons/AppDeployButton';
import getGithubRepoPath from '~/utils/getGithubRepoPath';
import getRelativeTime from '~/utils/getRelativeTime';
import Table, {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/general/Table';
import PreviewBranchDeleteButton from '~/components/buttons/PreviewBranchDeleteButton';

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
    fetcher,
    { refreshInterval: 10000 }
  );

  if (!previewBranches?.length) {
    return (
      <div className="text-center py-4 text-gray-500">
        No active preview branches
      </div>
    );
  }

  if (!app.preview_domain) {
    return (
      <div className="text-center py-4 text-gray-500">
        Preview domain not configured. Please configure it in the settings.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Branch</TableHead>
            <TableHead>Subdomain</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Deployment</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {previewBranches.map((previewBranch) => (
            <TableRow key={previewBranch.id}>
              <TableCell className="font-medium text-gray-900 max-w-0">
                <div className="break-words whitespace-pre-wrap">
                  {previewBranch.branch}
                </div>
              </TableCell>
              <TableCell className="max-w-0">
                <a 
                  href={`https://${previewBranch.subdomain}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-500 hover:text-blue-700 underline block break-words whitespace-pre-wrap"
                >
                  {previewBranch.subdomain}
                </a>
              </TableCell>
              <TableCell>
                {previewBranch.last_deployment_commit ? (
                  <a 
                    href={`https://github.com/${getGithubRepoPath(app.repo_url)}/commit/${previewBranch.last_deployment_commit}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700 underline"
                  >
                    {previewBranch.last_deployment_commit.substring(0, 7)}
                  </a>
                ) : (
                  'N/A'
                )}
              </TableCell>
              <TableCell>
                <Badge color={getServiceStatusColor(previewBranch.status as ServiceStatus)} withDot>
                  {previewBranch.status}
                </Badge>
              </TableCell>
              <TableCell>
                {previewBranch.last_deployment_at ? (
                  <>
                    {new Date(previewBranch.last_deployment_at).toLocaleString()}
                    <span className="text-gray-400"> ({getRelativeTime(previewBranch.last_deployment_at)})</span>
                  </>
                ) : (
                  'Never'
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <AppDeployButton app={app} branch={previewBranch.branch} />
                <PreviewBranchDeleteButton appId={app.id} branch={previewBranch.branch} onDeleted={() => mutate()} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
} 