'use client';

import DeploymentLogViewer from '~/components/deployments/DeploymentLogViewer';
import {
  DeploymentDeployLogsData,
  useDeploymentDeployLogs,
} from '~/hooks/useDeploymentDeployLogs';
import { AppDeployment, DeploymentLog } from '~/types';

interface DeploymentLogViewerContainerProps {
  appName: string;
  deploymentId: number;
  enabled?: boolean;
  initialApp?: AppDeployment;
  initialDeployLogs?: DeploymentLog[];
}

export default function DeploymentLogViewerContainer({
  appName,
  deploymentId,
  enabled = true,
  initialApp,
  initialDeployLogs,
}: DeploymentLogViewerContainerProps) {
  const initialData: DeploymentDeployLogsData | undefined =
    initialApp && initialDeployLogs
      ? { app: initialApp, logs: initialDeployLogs }
      : undefined;

  const { data, error, isLoading, mutate } = useDeploymentDeployLogs(
    appName,
    deploymentId,
    { enabled, initialData }
  );

  if (!enabled) {
    return null;
  }

  if (error) {
    return (
      <p className="text-danger-ink text-center py-24 text-field">Error loading deployment logs.</p>
    );
  }

  if ((isLoading && !data) || !data?.app) {
    return <p className="text-ink-faint text-center py-24 text-field">Loading logs...</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
    <DeploymentLogViewer
      app={data.app}
      deploymentId={deploymentId}
      appName={appName}
      deployLogs={data.logs}
      deployLoading={isLoading && !data.logs.length}
      deployError={error}
      onRefreshDeploy={() => mutate()}
    />
    </div>
  );
}
