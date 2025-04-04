'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useEffect, useRef } from 'react';
import AppsTable from '~/components/tables/AppsTable';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import Card from '~/components/general/Card';
import fetcher from '~/utils/fetcher';

export default function AppsSection() {
  const { mutate } = useSWRConfig();
  const { data: apps } = useSWR('/api/apps', fetcher);
  const { data: deployments } = useSWR('/api/apps/deployments', fetcher);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Continously revalidate data using SWR
    const revalidateData = async () => {
      try {
        await Promise.all([
          mutate('/api/apps', undefined, { revalidate: true }),
          mutate('/api/apps/deployments', undefined, { revalidate: true }),
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