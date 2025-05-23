import Badge from "~/components/general/Badge";
import { getServiceStatusColor } from "~/utils/serviceColors";
import { ServiceStatus, DeploymentLog, AppDeployment } from "~/types";

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
        {
          logs.map((log) => {
            const timestamp = new Date(log.created_at).toLocaleString();
            const typeClass = getLogTypeClass(log.type);

            return (
              <div key={log.id} className={`log-entry p-4 rounded ${typeClass}`}>
                <div className="flex items-start justify-between">
                  <span className="font-mono text-xs text-gray-500">{timestamp}</span>
                  <span className="uppercase text-xs font-semibold ml-2">{log.type}</span>
                </div>
                <div className="mt-1">{log.message}</div>
                {log.metadata && (
                  <pre className="text-xs mt-2 text-gray-600 whitespace-pre-wrap break-words">
                    <span dangerouslySetInnerHTML={{ __html: JSON.stringify(log.metadata, null, 2).replace(/\\n/g, '<br />') }} />
                  </pre>
                )}
              </div>
            );
          })
        }
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

function getLogTypeClass(type: string): string {
  switch (type) {
    case 'error':
      return 'bg-red-50 border-l-4 border-red-500';
    case 'warning':
      return 'bg-yellow-50 border-l-4 border-yellow-500';
    case 'debug':
      return 'bg-gray-50 border-l-4 border-gray-500';
    default:
      return 'bg-blue-50 border-l-4 border-blue-500';
  }
} 