import { DeploymentLog, AppDeployment } from "~/types";
import AppDeploymentInformation from "~/components/deployments/AppDeploymentInformationContainer";

interface DeploymentLogsModalProps {
  app: AppDeployment;
  logs: DeploymentLog[];
}

export default function DeploymentLogsModal({ app, logs }: DeploymentLogsModalProps) {
  return <AppDeploymentInformation app={app} logs={logs} />;
}