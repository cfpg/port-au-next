'use client';

import { useEffect, useState } from 'react';
import AppsTable from '~/components/tables/AppsTable';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import { Deployment, App } from '~/types';
import { fetchApps, fetchRecentDeployments } from '~/app/(dashboard)/actions';
import Card from '~/components/general/Card';

interface AppsSectionProps {
  initialApps: App[];
  initialDeployments: Deployment[];
}

export default function AppsSection({ initialApps, initialDeployments }: AppsSectionProps) {
  const [apps, setApps] = useState<App[]>(initialApps);
  const [deployments, setDeployments] = useState<Deployment[]>(initialDeployments);

  useEffect(() => {
    setApps(initialApps);
  }, [initialApps]);

  useEffect(() => {
    setDeployments(initialDeployments);
  }, [initialDeployments]);

  useEffect(() => {
    // Continuously poll for apps data
    const poolApps = async () => {
      const response = await fetchApps();
      setApps(response);
    };

    let appsTimeoutId: NodeJS.Timeout;
    const scheduleNextPool = () => {
      appsTimeoutId = setTimeout(async () => {
        await poolApps();
        scheduleNextPool();
      }, 10000);
    };
    scheduleNextPool();

    // Continuously poll for deployments data
    const poolDeployments = async () => {
      const response = await fetchRecentDeployments();
      setDeployments(response as Deployment[]);
    };

    let deploymentsTimeoutId: NodeJS.Timeout;
    const scheduleNextPoolDeployments = () => {
      deploymentsTimeoutId = setTimeout(async () => {
        await poolDeployments();
        scheduleNextPoolDeployments();
      }, 10000);
    };
    scheduleNextPoolDeployments();

    // Clean up timeouts when component unmounts
    return () => {
      clearTimeout(appsTimeoutId);
      clearTimeout(deploymentsTimeoutId);
    };
  }, []);

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