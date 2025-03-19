import { getStatusColor } from '~/utils/status';
import Button from './general/Button';
import Link from './general/Link';
import getSingleAppPath from '~/utils/getSingleAppPath';

interface App {
  id: number;
  name: string;
  repository: string;
  branch: string;
  domain?: string;
  db_name?: string;
  db_user?: string;
  db_password?: string;
  cloudflare_zone_id?: string;
  env: Record<string, string>;
  status: string;
  last_deployment?: {
    version: string;
    commit_id: string;
    status: string;
    deployed_at: Date;
  };
}

interface AppTableProps {
  apps: App[];
  onDeploy: (appName: string) => void;
  onViewDeployments: (appName: string) => void;
  onEditEnvVars: (appName: string) => void;
  onEditSettings: (appName: string) => void;
  onDelete: (appName: string) => void;
}

export default function AppTable({
  apps,
  onDeploy,
  onViewDeployments,
  onEditEnvVars,
  onEditSettings,
  onDelete,
}: AppTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Repository
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Branch
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Domain
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Deployment
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {apps.map((app) => (
            <tr key={app.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                <Link href={getSingleAppPath(app.name)} variant="nav">{app.name}</Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.repository}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.branch}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.domain || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(app.status)}`}>
                  {app.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.last_deployment ? new Date(app.last_deployment.deployed_at).toLocaleString() : 'Never'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <Button
                  onClick={() => onDeploy(app.name)}
                  color="primary"
                  size="sm"
                >
                  <i className="fas fa-rocket mr-2"></i>
                  Deploy
                </Button>
                <Button
                  onClick={() => onViewDeployments(app.name)}
                  color="blue"
                  size="sm"
                >
                  <i className="fas fa-history mr-2"></i>
                  History
                </Button>
                <Button
                  onClick={() => onEditEnvVars(app.name)}
                  color="green"
                  size="sm"
                >
                  <i className="fas fa-laptop-code mr-2"></i>
                  Env Vars
                </Button>
                <Button
                  onClick={() => onEditSettings(app.name)}
                  color="yellow"
                  size="sm"
                >
                  <i className="fas fa-gear mr-2"></i>
                  Settings
                </Button>
                <Button
                  onClick={() => onDelete(app.name)}
                  color="red"
                  size="sm"
                >
                  <i className="fas fa-trash mr-2"></i>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}