import useSWR from 'swr';

import { AppDeployment, DeploymentLog } from '~/types';
import fetcher from '~/utils/fetcher';

export type DeploymentDeployLogsData = {
  app: AppDeployment;
  logs: DeploymentLog[];
};

function deployLogsApiPath(appName: string, deploymentId: number): string {
  return `/api/apps/deployments/${appName}/${deploymentId}/logs/deploy`;
}

async function loadDeploymentDeployLogs(
  appName: string,
  deploymentId: number
): Promise<DeploymentDeployLogsData> {
  const deployResponse = await fetcher(deployLogsApiPath(appName, deploymentId));
  const metaResponse = await fetch(
    `/apps/${appName}/deployments?appName=${encodeURIComponent(appName)}&deploymentId=${deploymentId}`
  );

  if (!metaResponse.ok) {
    throw new Error('Failed to load deployment metadata');
  }

  const meta = await metaResponse.json();
  return {
    app: meta.app as AppDeployment,
    logs: (deployResponse as { logs: DeploymentLog[] }).logs,
  };
}

type UseDeploymentDeployLogsOptions = {
  enabled?: boolean;
  initialData?: DeploymentDeployLogsData;
};

export function useDeploymentDeployLogs(
  appName: string,
  deploymentId: number,
  options: UseDeploymentDeployLogsOptions = {}
) {
  const { enabled = true, initialData } = options;

  return useSWR<DeploymentDeployLogsData>(
    enabled ? ['deployment-deploy-logs', appName, deploymentId] : null,
    () => loadDeploymentDeployLogs(appName, deploymentId),
    { fallbackData: initialData }
  );
}
