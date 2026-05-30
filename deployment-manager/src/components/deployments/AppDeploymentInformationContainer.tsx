import Badge from "~/components/general/Badge";
import { getServiceStatusColor } from "~/utils/serviceColors";
import { ServiceStatus, DeploymentLog, AppDeployment } from "~/types";
import DeploymentLogEntry from "~/components/deployments/DeploymentLogEntry";

interface AppDeploymentInformationContainerProps {
  app: AppDeployment;
  logs: DeploymentLog[];
}

export function AppDeploymentInformation({ app }: { app: AppDeployment }) {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <h2 className="text-lg font-semibold mb-4">Deployment Details</h2>
      <div className="grid grid-cols-2 gap-2">
        <p className="text-sm text-gray-600">
          <strong>App Name:</strong> {app.name}
        </p>
        <p className="text-sm text-gray-600">
          <strong>Deployment Date:</strong> {new Date(app.deployed_at || "").toLocaleString()}
        </p>
        <p className="text-sm text-gray-600">
          <strong>Deployment Status:</strong> <Badge color={getServiceStatusColor(app.status as ServiceStatus)} withDot>{app.status}</Badge>
        </p>
      </div>
    </div>
  );
}

export function AppDeploymentLogs({ logs }: { logs: DeploymentLog[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Deployment Logs</h2>
      <div className="space-y-4">
        {logs.map((log) => (
          <DeploymentLogEntry key={log.id} log={log} />
        ))}
      </div>
    </div>
  )
}

export default function AppDeploymentInformationContainer({ app, logs }: AppDeploymentInformationContainerProps) {
  return (
    <div id="deployment-logs-list" className="space-y-4">
      {logs.length === 0 ? (
        <div className="text-center py-4 text-gray-500">No logs found for this deployment</div>
      ) : <>
        <div className="flex flex-col gap-4">
          <AppDeploymentInformation app={app} />
          <AppDeploymentLogs logs={logs} />
        </div>
      </>}
    </div >
  );
}
