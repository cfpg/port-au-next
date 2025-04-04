"use client";

import { useEffect, useRef } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { App } from '~/types';
import Card from '~/components/general/Card';
import ActivePreviewBranches from '~/components/settings/ActivePreviewBranches';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import fetcher from '~/utils/fetcher';

export default function SingleAppDashboard({ app }: { app: App }) {
  const { mutate } = useSWRConfig();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: deployments } = useSWR(`/api/apps/${app.id}/deployments`, fetcher);

  useEffect(() => {
    // Continously revalidate data using SWR
    const revalidateData = async () => {
      try {
        await Promise.all([
          mutate(`/api/apps/${app.id}/preview-branches`, undefined, { revalidate: true }),
          mutate(`/api/apps/${app.id}/deployments`, undefined, { revalidate: true }),
        ]);
      } finally {
        // Schedule next revalidation after current one completes
        timeoutRef.current = setTimeout(revalidateData, 10000);
      }
    };

    // Start the revalidation cycle
    revalidateData();

    // Clean up timeout when component unmounts
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [mutate]);

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