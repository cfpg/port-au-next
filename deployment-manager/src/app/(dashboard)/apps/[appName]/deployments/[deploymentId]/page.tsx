import { notFound } from 'next/navigation';

import DeploymentLogViewerContainer from '~/components/deployments/DeploymentLogViewerContainer';
import Panel from '~/components/general/Panel';
import PageHeader from '~/components/general/PageHeader';
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
      <div>
        <PageHeader title="Deployment Logs" subtitle={appName} />

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
