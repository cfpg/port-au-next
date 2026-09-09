"use client";

import useSWR from 'swr';
import Panel from '~/components/general/Panel';
import ActivePreviewBranches from '~/components/settings/ActivePreviewBranches';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import fetcher from '~/utils/fetcher';

export default function SingleAppDashboard({ appId }: { appId: number }) {
  const { data: deployments } = useSWR(`/api/apps/${appId}/deployments`, fetcher, { refreshInterval: 10000 });
  const { data: app } = useSWR(`/api/apps/${appId}`, fetcher, { refreshInterval: 10000 });

  return (
    <>
      <Panel
        className="mb-24"
        title="Active Preview Branches"
        flush
        content={app ? <ActivePreviewBranches app={app} /> : <div className="text-center py-24 text-ink-faint">Loading…</div>}
      />

      <Panel
        title="Deployment History"
        flush
        content={
          <DeploymentHistoryTable deployments={deployments ?? []} scope="app" />
        }
      />
    </>
  )
}