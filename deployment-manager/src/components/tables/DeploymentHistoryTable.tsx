'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
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
import Menu from '~/components/general/Menu';
import Modal from '~/components/general/Modal';
import DeploymentLogViewerContainer from '~/components/deployments/DeploymentLogViewerContainer';
import { EyeIcon, RefreshIcon, ClipboardIcon, CheckIcon } from '~/components/general/icons';
import { triggerDeployment } from '~/app/(dashboard)/actions';
import { showToast } from '~/components/general/Toaster';

interface DeploymentHistoryTableProps {
  deployments?: Deployment[];
  /** "app" hides the App column and swaps two buttons for a single overflow menu - this app's own history is immutable, so actions only read or re-run it. */
  scope?: 'global' | 'app';
}

/** A DeploymentRow's ⋮ menu - view logs, redeploy this build, copy commit SHA. */
function DeploymentRowMenu({ deployment }: { deployment: Deployment }) {
  const pathname = usePathname();
  const [logsOpen, setLogsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRedeploy = async () => {
    try {
      const result = await triggerDeployment(deployment.app_name, { pathname, branch: deployment.branch });
      if (result?.error) throw new Error(result.error);
      showToast(`Redeploying ${deployment.app_name} · ${deployment.version}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to redeploy', 'error');
    }
  };

  const handleCopySha = async () => {
    if (!deployment.commit_id) return;
    await navigator.clipboard.writeText(deployment.commit_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Menu
        ariaLabel={`Actions for ${deployment.version}`}
        items={[
          { label: 'View logs', icon: <EyeIcon className="text-ink-muted" />, onClick: () => setLogsOpen(true) },
          { label: 'Redeploy this build', icon: <RefreshIcon className="text-ink-muted" />, onClick: handleRedeploy },
          ...(deployment.commit_id
            ? [{
                label: copied ? 'Copied' : 'Copy commit SHA',
                icon: copied ? <CheckIcon className="text-success-ink" /> : <ClipboardIcon className="text-ink-muted" />,
                onClick: handleCopySha,
              }]
            : []),
        ]}
      />
      <Modal
        isOpen={logsOpen}
        onClose={() => setLogsOpen(false)}
        title={`Deployment Logs - ${deployment.app_name}`}
        size="logs"
      >
        <DeploymentLogViewerContainer appName={deployment.app_name} deploymentId={deployment.id} enabled={logsOpen} />
      </Modal>
    </>
  );
}

export default function DeploymentHistoryTable({
  deployments,
  scope = 'global',
}: DeploymentHistoryTableProps) {
  const columns: TableColumn<Deployment>[] = [
    ...(scope === 'global'
      ? [
          {
            key: 'app',
            header: 'app',
            width: '1.3fr',
            render: (d: Deployment) => (
              <Link href={`/apps/${d.app_name}/deployments/${d.id}`} variant="default" className="truncate block">
                {d.app_name}
              </Link>
            ),
          },
        ]
      : []),
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
      width: scope === 'app' ? '66px' : '110px',
      align: 'right',
      render: (d) =>
        scope === 'app' ? (
          <DeploymentRowMenu deployment={d} />
        ) : (
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
