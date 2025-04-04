"use client";

import useSWR from 'swr';
import { App } from '~/types';
import Card from '~/components/general/Card';
import ActivePreviewBranches from '~/components/settings/ActivePreviewBranches';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import fetcher from '~/utils/fetcher';

export default function SingleAppDashboard({ app }: { app: App }) {
  const { data: deployments } = useSWR(`/api/apps/${app.id}/deployments`, fetcher, { refreshInterval: 10000 });

  return (
    <>
      {/* Active Preview Branches Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Active Preview Branches"
        padding="table"
        content={<ActivePreviewBranches app={app} />}
      />

      {/* Deployment History Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Deployment History"
        padding="table"
        content={
          <DeploymentHistoryTable deployments={deployments} />
        }
      />
    </>
  )
}