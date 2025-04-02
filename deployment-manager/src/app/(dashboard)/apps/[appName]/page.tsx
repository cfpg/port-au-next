import Card from '~/components/general/Card';
import Badge from '~/components/general/Badge';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import { EnvVarsForm } from '~/components/EnvVarsForm';
import { AppSettingsForm } from '~/components/AppSettingsForm';
import { fetchApp, fetchAppDeployments } from './actions';
import { getServiceStatusColor } from '~/utils/serviceColors';
import getRelativeTime from '~/utils/getRelativeTime';
import AppDeleteButton from '~/components/buttons/AppDeleteButton';
import AppDeployButton from '~/components/buttons/AppDeployButton';
import { ServiceStatus } from '~/types';
import EnvVarsSettings from '~/components/env-vars/EnvVarsSettings';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface PageProps {
  params: {
    appName: string;
  };
}

export default async function SingleAppPage({ params }: PageProps) {
  const { appName } = await params;
  const app = await fetchApp(appName);
  const deployments = await fetchAppDeployments(app.id);

  return (
    <div>
      {/* App Information Section */}
      <Card
        className="bg-white text-black mb-8"
        header={
          <>
            <h3 className="text-2xl font-bold">{app.name}</h3>
            <div className="flex items-center gap-4">
              <Badge color={getServiceStatusColor(app.status as ServiceStatus)} withDot>
                {app.status}
              </Badge>
              <AppDeployButton appName={app.name} />
              <AppDeleteButton appName={app.name} />
            </div>
          </>
        }
        content={
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Repository</h3>
              <p className="text-sm text-gray-500">{app.repo_url}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Branch</h3>
              <p className="text-sm text-gray-500">{app.branch}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Domain</h3>
              <p className="text-sm text-gray-500">
                {
                  app.domain ?
                    <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">{app.domain}</a> : 'Not set'
                }
              </p>
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
          </div>}
      />

      {/* Deployment Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Deployment History"
        padding="table"
        content={
          <DeploymentHistoryTable
            deployments={deployments}
          />
        }
      />

      <Card
        className='bg-white text-black mb-8'
        title="Environment Variables"
        padding="content"
        content={
          <EnvVarsSettings
            appId={app.id}
          />
        }
      />

      <Card
        className='bg-white text-black mb-8'
        title="App Settings"
        padding="content"
        content={
          <AppSettingsForm
            appId={app.id}
            initialSettings={{
              name: app.name,
              domain: app.domain,
              repo_url: app.repo_url,
              branch: app.branch,
              cloudflare_zone_id: app.cloudflare_zone_id,
            }}
          />
        }
      />
    </div>
  );
}