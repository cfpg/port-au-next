'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { App, Deployment, ServiceStatus } from '~/types';
import Table, { TableColumn } from '~/components/general/Table';
import RelativeTime from '~/components/general/RelativeTime';
import getGithubRepoPath from '~/utils/getGithubRepoPath';
import Badge from '~/components/general/Badge';
import CodeToken from '~/components/general/CodeToken';
import { getServiceStatusTone } from '~/utils/serviceColors';
import Link from '~/components/general/Link';
import getSingleAppPath from '~/utils/getSingleAppPath';
import AppDeployButton from '~/components/buttons/AppDeployButton';
import EmptyState from '~/components/general/EmptyState';
import Menu from '~/components/general/Menu';
import Button from '~/components/general/Button';
import Modal from '~/components/general/Modal';
import ConfirmDialog from '~/components/general/ConfirmDialog';
import DeploymentLogViewerContainer from '~/components/deployments/DeploymentLogViewerContainer';
import { EyeIcon, RefreshIcon, ClipboardIcon, CheckIcon } from '~/components/general/icons';
import { triggerDeployment } from '~/app/(dashboard)/actions';
import { showToast } from '~/components/general/Toaster';

interface DeploymentHistoryTableProps {
  deployments?: Deployment[];
  /** "app" hides the App column and exposes logs as the row's primary action. */
  scope?: 'global' | 'app';
}

/** A DeploymentRow's ⋮ menu - view logs, redeploy this build, copy commit SHA. */
function DeploymentRowMenu({ deployment, includeViewLogs = true }: { deployment: Deployment; includeViewLogs?: boolean }) {
  const pathname = usePathname();
  const { mutate } = useSWRConfig();
  const [logsOpen, setLogsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRedeploy, setConfirmRedeploy] = useState(false);
  const [isRedeploying, setIsRedeploying] = useState(false);

  const handleRedeploy = async (confirmConcurrent = false) => {
    try {
      setIsRedeploying(true);
      const result = await triggerDeployment(deployment.app_name, {
        pathname,
        branch: deployment.branch,
        confirmConcurrent,
      });
      if (result?.requiresConfirmation) {
        setConfirmRedeploy(true);
        return;
      }
      if (result?.error) throw new Error(result.error);
      setConfirmRedeploy(false);
      showToast('Deployment queued.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to redeploy', 'error');
    } finally {
      setIsRedeploying(false);
      mutate(`/api/apps/${deployment.app_id}/deployments`);
      mutate('/api/apps');
      mutate('/api/apps/deployments');
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
          ...(includeViewLogs
            ? [{ label: 'View logs', icon: <EyeIcon className="text-ink-muted" />, onClick: () => setLogsOpen(true) }]
            : []),
          { label: 'Redeploy this build', icon: <RefreshIcon className="text-ink-muted" />, onClick: () => handleRedeploy() },
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
      <ConfirmDialog
        isOpen={confirmRedeploy}
        onClose={() => setConfirmRedeploy(false)}
        onConfirm={() => handleRedeploy(true)}
        isLoading={isRedeploying}
        title="Queue another deployment?"
        confirmLabel="Queue another"
        confirmVariant="primary"
        description="This branch already has a queued or running deployment. Queue another?"
      />
    </>
  );
}

function DeploymentLogAction({ deployment }: { deployment: Deployment }) {
  const [logsOpen, setLogsOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setLogsOpen(true)}>
        <EyeIcon />
        View logs
      </Button>
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
              // A queued placeholder's `id` is a synthetic negative number, not a real
              // deployment - link to the app itself rather than a nonexistent detail page.
              <Link
                href={d.isQueued ? getSingleAppPath(d.app_name) : `/apps/${d.app_name}/deployments/${d.id}`}
                variant="default"
                className="truncate block"
              >
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
      render: (d) =>
        d.isQueued ? (
          <span className="font-mono text-meta text-ink-ghost">-</span>
        ) : (
          <span className="font-mono text-meta text-ink">{d.version}</span>
        ),
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
      render: (d) => {
        const badge = <Badge tone={getServiceStatusTone(d.status as ServiceStatus)} withDot>{d.status}</Badge>;
        return d.queueError ? <span title={d.queueError}>{badge}</span> : badge;
      },
    },
    {
      key: 'deployedAt',
      header: 'deployed at',
      width: '1.7fr',
      render: (d) => (d.deployed_at ? (
        <RelativeTime
          value={d.deployed_at}
          showRelative
          refreshInterval={d.status.toLowerCase() === 'building' ? 1_000 : 30_000}
        />
      ) : <span className="font-mono text-meta text-ink-ghost">N/A</span>),
    },
    {
      key: 'actions',
      header: 'actions',
      width: scope === 'app' ? '132px' : '88px',
      align: 'right',
      render: (d) => {
        // No deployment id exists yet - nothing here (logs, redeploy, copy SHA) has
        // anything to act on.
        if (d.isQueued) {
          return null;
        }
        return scope === 'app' ? (
          <>
            <DeploymentLogAction deployment={d} />
            <DeploymentRowMenu deployment={d} includeViewLogs={false} />
          </>
        ) : (
          <>
            <AppDeployButton app={{ name: d.app_name, id: d.app_id } as App} branch={d.branch} />
            <DeploymentRowMenu deployment={d} />
          </>
        );
      },
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
