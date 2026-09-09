import Badge from "~/components/general/Badge";
import DefinitionList from "~/components/general/DefinitionList";
import EmptyState from "~/components/general/EmptyState";
import RelativeTime from "~/components/general/RelativeTime";
import { getServiceStatusTone } from "~/utils/serviceColors";
import { ServiceStatus, DeploymentLog, AppDeployment } from "~/types";
import DeploymentLogEntry from "~/components/deployments/DeploymentLogEntry";

interface AppDeploymentInformationContainerProps {
  app: AppDeployment;
  logs: DeploymentLog[];
}

export function AppDeploymentInformation({ app }: { app: AppDeployment }) {
  return (
    <div className="flex flex-col gap-11">
      <h2 className="font-display font-semibold text-panel">Deployment Details</h2>
      <DefinitionList
        items={[
          { label: 'App Name', value: app.name },
          { label: 'Deployment Date', value: app.deployed_at ? <RelativeTime value={String(app.deployed_at)} showRelative /> : 'N/A' },
          { label: 'Status', value: <Badge tone={getServiceStatusTone(app.status as ServiceStatus)} withDot>{app.status}</Badge> },
        ]}
        columns={3}
      />
    </div>
  );
}

export function AppDeploymentLogs({ logs }: { logs: DeploymentLog[] }) {
  return (
    <div className="flex flex-col gap-11">
      <h2 className="font-display font-semibold text-panel">Deployment Logs</h2>
      <div className="flex flex-col gap-14">
        {logs.map((log) => (
          <DeploymentLogEntry key={log.id} log={log} />
        ))}
      </div>
    </div>
  )
}

export default function AppDeploymentInformationContainer({ app, logs }: AppDeploymentInformationContainerProps) {
  return (
    <div id="deployment-logs-list" className="flex flex-col gap-14">
      {logs.length === 0 ? (
        <EmptyState title="No logs found" description="This deployment doesn't have any recorded log entries." />
      ) : (
        <div className="flex flex-col gap-14">
          <AppDeploymentInformation app={app} />
          <AppDeploymentLogs logs={logs} />
        </div>
      )}
    </div>
  );
}
