import Card, { CardContent, CardHeader, CardTitle } from '~/components/general/Card';
import Button from '~/components/general/Button';
import Badge from '~/components/general/Badge';
import DeploymentHistoryTable from '~/components/DeploymentHistoryTable';
import { EnvVarsForm } from '~/components/EnvVarsForm';
import { AppSettingsForm } from '~/components/AppSettingsForm';
import { fetchApp, fetchAppDeployments } from './actions';
import { getStatusColor } from '~/utils/status';
import getRelativeTime from '~/utils/getRelativeTime';
import DeploymentLogsModal from '~/components/modals/DeploymentLogsModal';

interface PageProps {
  params: {
    appName: string;
  };
  searchParams: {
    modalViewLogs?: string;
  };
}

export default async function SingleAppPage({ params, searchParams }: PageProps) {
  const { appName } = await params;
  const app = await fetchApp(appName);
  const deployments = await fetchAppDeployments(app.id);

  const { modalViewLogs } = await searchParams;

  return (
    <div>
      {/* App Information Section */}
      <Card className="bg-white text-black mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl font-bold">{app.name}</CardTitle>
          <div className="flex items-center gap-4">
            <Badge className={getStatusColor(app.status)}>
              {app.status}
            </Badge>
            <Button>
              <i className="fas fa-rocket mr-2"></i>
              Deploy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Repository</h3>
              <p className="text-sm text-gray-500">{app.repository}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Branch</h3>
              <p className="text-sm text-gray-500">{app.branch}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Domain</h3>
              <p className="text-sm text-gray-500">{app.domain || 'Not set'}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Last Deployment</h3>
              <p className="text-sm text-gray-500">
                {app.last_deployment
                  ? `${new Date(app.last_deployment.deployed_at).toLocaleString()}`
                  : 'Never'}
                {app.last_deployment && <span className="text-gray-400"> ({getRelativeTime(app.last_deployment.deployed_at)})</span>}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deployment Section */}
      <Card className='bg-white text-black mb-8'>
        <CardHeader>
          <CardTitle>Deployment History</CardTitle>
        </CardHeader>
        <CardContent>
          <DeploymentHistoryTable
            deployments={deployments}
          />
        </CardContent>
      </Card>

      <Card className='bg-white text-black mb-8'>
        <CardHeader>
          <CardTitle>Environment Variables</CardTitle>
        </CardHeader>
        <CardContent>
          <EnvVarsForm appId={app.id} branch={app.branch} initialEnvVars={app.env} />
        </CardContent>
      </Card>

      <Card className='bg-white text-black mb-8'>
        <CardHeader>
          <CardTitle>App Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <AppSettingsForm
            appId={app.id}
            initialSettings={{
              domain: app.domain,
              db_name: app.db_name,
              db_user: app.db_user,
              db_password: app.db_password,
              cloudflare_zone_id: app.cloudflare_zone_id,
            }}
          />
        </CardContent>
      </Card>

      {modalViewLogs && (
        <DeploymentLogsModal
          appName={app.name}
          deploymentId={Number.parseInt(modalViewLogs)}
          closeHref={`/app/${app.name}`}
        />
      )}
    </div>
  );
}