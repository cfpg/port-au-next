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
      {/* Active Preview Branches Section */}
      <Panel
        className='bg-white text-black mb-8'
        title="Active Preview Branches"
        flush
        content={app ? <ActivePreviewBranches app={app} /> : <div className="text-center py-4 text-gray-500">Loading…</div>}
      />

      {/* Deployment History Section */}
      <Panel
        className='bg-white text-black mb-8'
        title="Deployment History"
        flush
        content={
          <DeploymentHistoryTable deployments={deployments ?? []} scope="app" />
        }
      />
    </>
  )
}