'use client';

import useSWR from 'swr';
import { App, ServiceStatus } from '~/types';
import fetcher from '~/utils/fetcher';
import { getServiceStatusTone } from '~/utils/serviceColors';
import Badge from '~/components/general/Badge';
import AppDeployButton from '~/components/buttons/AppDeployButton';
import getGithubRepoPath from '~/utils/getGithubRepoPath';
import RelativeTime from '~/components/general/RelativeTime';
import Table, { TableColumn } from '~/components/general/Table';
import CodeToken from '~/components/general/CodeToken';
import EmptyState from '~/components/general/EmptyState';
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
    app?.id ? `/api/apps/${app.id}/preview-branches` : null,
    fetcher,
    { refreshInterval: 10000 }
  );

  if (!app.preview_domain) {
    return (
      <EmptyState
        title="Preview domain not configured"
        description="Set a preview domain in Settings to enable preview branch deployments."
      />
    );
  }

  const columns: TableColumn<PreviewBranch>[] = [
    { key: 'branch', header: 'branch', width: '1.2fr', render: (b) => <span className="font-mono text-meta text-ink truncate block">{b.branch}</span> },
    {
      key: 'subdomain',
      header: 'subdomain',
      width: '1.4fr',
      render: (b) => (
        <a
          href={b.branch === app.branch ? `https://${app.domain}` : `https://${b.subdomain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-meta underline decoration-primary-line underline-offset-2 truncate block"
        >
          {b.subdomain}
        </a>
      ),
    },
    {
      key: 'commit',
      header: 'commit',
      width: '0.7fr',
      render: (b) =>
        b.last_deployment_commit ? (
          <CodeToken href={`https://github.com/${getGithubRepoPath(app.repo_url)}/commit/${b.last_deployment_commit}`}>
            {b.last_deployment_commit.substring(0, 7)}
          </CodeToken>
        ) : (
          <CodeToken>{null}</CodeToken>
        ),
    },
    {
      key: 'status',
      header: 'status',
      width: '0.85fr',
      render: (b) => <Badge tone={getServiceStatusTone(b.status as ServiceStatus)} withDot>{b.status}</Badge>,
    },
    {
      key: 'lastDeployment',
      header: 'last deployment',
      width: '1.7fr',
      render: (b) => (b.last_deployment_at ? <RelativeTime value={b.last_deployment_at} showRelative /> : <span className="font-mono text-meta text-ink-ghost">Never</span>),
    },
    {
      key: 'actions',
      header: 'actions',
      width: '150px',
      align: 'right',
      render: (b) => (
        <>
          <AppDeployButton app={app} branch={b.branch} />
          <PreviewBranchDeleteButton appId={app.id} branch={b.branch} onDeleted={() => mutate()} />
        </>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={previewBranches ?? []}
      rowKey={(b) => b.id}
      isLoading={!app.id || !previewBranches}
      emptyState={
        <EmptyState
          title="No active preview branches"
          description="Push a feature branch and a preview deployment appears here with its own database and subdomain."
        />
      }
    />
  );
}
