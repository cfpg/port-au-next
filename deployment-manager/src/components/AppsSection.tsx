'use client';

import useSWR from 'swr';
import AppsTable from '~/components/tables/AppsTable';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import Card from '~/components/general/Card';
import fetcher from '~/utils/fetcher';

export default function AppsSection() {
  const { data: apps } = useSWR('/api/apps', fetcher, { refreshInterval: 10000 });
  const { data: deployments } = useSWR('/api/apps/deployments', fetcher, { refreshInterval: 10000 });

  return (
    <>
      <Card
        className="bg-white mb-8"
        padding="table"
        title="Applications"
        content={
          <AppsTable
            apps={apps}
          />
        }
      />

      <Card
        className="bg-white"
        padding="table"
        title="Deployment History"
        content={
          <DeploymentHistoryTable
            deployments={deployments}
          />
        }
      />
    </>
  );
} 