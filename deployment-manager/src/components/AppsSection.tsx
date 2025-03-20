'use client';

import { useEffect, useState } from 'react';
import AppTable from './AppTable';
import { useToast } from './general/ToastContainer';
import DeploymentHistoryTable from './DeploymentHistoryTable';
import { Deployment, App } from '~/types';
import { triggerDeployment, fetchApps, fetchRecentDeployments } from '~/app/actions';
import Card, { CardHeader, CardTitle, CardContent } from '~/components/general/Card';

interface AppsSectionProps {
  initialApps: App[];
  initialDeployments: Deployment[];
}

export default function AppsSection({ initialApps, initialDeployments }: AppsSectionProps) {
  const [apps, setApps] = useState<App[]>(initialApps);
  const [deployments, setDeployments] = useState<Deployment[]>(initialDeployments);
  const { showToast } = useToast();

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

  const handleDeploy = async (appName: string) => {
    try {
      const result = await triggerDeployment(appName);
      if (!result.success) throw new Error(result.error);
      showToast('Deployment started successfully', 'success');
    } catch (error) {
      showToast('Failed to start deployment', 'error');
    }
  };

  return (
    <>
      <Card className="bg-white mb-8">
        <CardHeader>
          <CardTitle>Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <AppTable
            apps={apps}
            onDeploy={handleDeploy}
          />
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
        </CardHeader>
        <CardContent>
          <DeploymentHistoryTable
            deployments={deployments}
          />
        </CardContent>
      </Card>
    </>
  );
} 