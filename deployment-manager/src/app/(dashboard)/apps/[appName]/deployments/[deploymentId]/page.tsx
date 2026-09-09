import { notFound } from 'next/navigation';

import DeploymentLogViewerContainer from '~/components/deployments/DeploymentLogViewerContainer';
import Panel from '~/components/general/Panel';
import fetchLogs from '~/queries/fetchLogs';

interface SingleAppDeploymentPageProps {
  params: Promise<{
    appName: string;
    deploymentId: string;
  }>;
}

export default async function SingleAppDeploymentPage({ params }: SingleAppDeploymentPageProps) {
  const { appName, deploymentId } = await params;
  const parsedDeploymentId = parseInt(deploymentId, 10);

  if (!Number.isFinite(parsedDeploymentId)) {
    notFound();
  }

  try {
    const { app, logs } = await fetchLogs(appName, parsedDeploymentId);

    if (!app) {
      notFound();
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Deployment Logs - {appName}</h1>
        </div>

        <Panel
          title={`Deployment #${deploymentId}`}
          content={
            <DeploymentLogViewerContainer
              appName={appName}
              deploymentId={parsedDeploymentId}
              initialApp={app}
              initialDeployLogs={logs}
            />
          }
        />
      </div>
    );
  } catch (error) {
    console.error('Error fetching deployment details:', error);
    notFound();
  }
}
