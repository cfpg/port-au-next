import {AppDeploymentInformation, AppDeploymentLogs} from "~/components/deployments/AppDeploymentInformationContainer";
import { notFound } from "next/navigation";
import Card from "~/components/general/Card";

import fetchLogs from "~/queries/fetchLogs";
interface SingleAppDeploymentPageProps {
  params: {
    appName: string;
    deploymentId: string;
  };
}

export default async function SingleAppDeploymentPage({ params }: SingleAppDeploymentPageProps) {
  const { appName, deploymentId } = params;

  try {
    const { app, logs } = await fetchLogs(appName, parseInt(deploymentId));

    if (!app || !logs || logs.length === 0) {
      notFound();
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            Deployment Details - {appName}
          </h1>
        </div>

        <Card
          title={`App Deployment Information - ${appName} - Deployment ID: ${deploymentId}`}
          content={<AppDeploymentInformation app={app} />}
        />

        <Card
          content={<AppDeploymentLogs logs={logs} />}
        />
      </div>
    );
  } catch (error) {
    console.error('Error fetching deployment details:', error);
    notFound();
  }
}