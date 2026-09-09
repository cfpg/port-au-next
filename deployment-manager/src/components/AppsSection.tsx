'use client';

import useSWR from 'swr';
import AppsTable from '~/components/tables/AppsTable';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import Panel from '~/components/general/Panel';
import fetcher from '~/utils/fetcher';

export default function AppsSection() {
  const { data: apps } = useSWR('/api/apps', fetcher, { refreshInterval: 10000 });
  const { data: deployments } = useSWR('/api/apps/deployments', fetcher, { refreshInterval: 10000 });

  return (
    <>
      <Panel
        className="mb-24"
        flush
        title="Applications"
        content={
          <AppsTable
            apps={apps}
          />
        }
      />

      <Panel
        flush
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