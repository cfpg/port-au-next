import { App, Deployment, ServiceStatus } from '~/types';
import Table, { TableColumn } from '~/components/general/Table';
import RelativeTime from '~/components/general/RelativeTime';
import getGithubRepoPath from '~/utils/getGithubRepoPath';
import Badge from '~/components/general/Badge';
import CodeToken from '~/components/general/CodeToken';
import { getServiceStatusTone } from '~/utils/serviceColors';
import ViewLogsButton from '~/components/deployments/ViewLogsButton';
import Link from '~/components/general/Link';
import AppDeployButton from '~/components/buttons/AppDeployButton';
import EmptyState from '~/components/general/EmptyState';

interface DeploymentHistoryTableProps {
  deployments?: Deployment[];
}

export default function DeploymentHistoryTable({
  deployments,
}: DeploymentHistoryTableProps) {
  const columns: TableColumn<Deployment>[] = [
    {
      key: 'app',
      header: 'app',
      width: '1.3fr',
      render: (d) => (
        <Link href={`/apps/${d.app_name}/deployments/${d.id}`} variant="default" className="truncate block">
          {d.app_name}
        </Link>
      ),
    },
    {
      key: 'version',
      header: 'version',
      width: '1.5fr',
      render: (d) => <span className="font-mono text-meta text-ink">{d.version}</span>,
    },
    { key: 'branch', header: 'branch', width: '0.7fr', render: (d) => <span className="font-mono text-meta text-ink-muted">{d.branch || 'main'}</span> },
    {
      key: 'commit',
      header: 'commit',
      width: '0.7fr',
      render: (d) =>
        d.commit_id ? (
          <CodeToken href={`https://github.com/${getGithubRepoPath(d.app_repository)}/commit/${d.commit_id}`}>
            {d.commit_id.substring(0, 7)}
          </CodeToken>
        ) : (
          <CodeToken>{null}</CodeToken>
        ),
    },
    {
      key: 'status',
      header: 'status',
      width: '0.9fr',
      render: (d) => <Badge tone={getServiceStatusTone(d.status as ServiceStatus)} withDot>{d.status}</Badge>,
    },
    {
      key: 'deployedAt',
      header: 'deployed at',
      width: '1.7fr',
      render: (d) => (d.deployed_at ? <RelativeTime value={d.deployed_at} showRelative /> : <span className="font-mono text-meta text-ink-ghost">N/A</span>),
    },
    {
      key: 'actions',
      header: 'actions',
      width: '110px',
      align: 'right',
      render: (d) => (
        <>
          <AppDeployButton app={{ name: d.app_name, id: d.app_id } as App} branch={d.branch} />
          <ViewLogsButton deploymentId={d.id} appName={d.app_name} />
        </>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={deployments ?? []}
      rowKey={(d) => d.id}
      isLoading={!deployments}
      emptyState={<EmptyState title="No deployments yet" description="Deployments will appear here once you deploy this app." />}
    />
  );
}
