interface App {
  name: string;
  repository: string;
  branch: string;
  port: number;
  status: 'running' | 'stopped' | 'error';
  last_deployment?: string;
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
  const getStatusColor = (status: App['status']) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800';
      case 'stopped':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

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
              Port
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
            <tr key={app.name}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {app.name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.repository}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.branch}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.port}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(app.status)}`}>
                  {app.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.last_deployment || 'Never'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button
                  onClick={() => onDeploy(app.name)}
                  className="text-indigo-600 hover:text-indigo-900"
                >
                  Deploy
                </button>
                <button
                  onClick={() => onViewDeployments(app.name)}
                  className="text-blue-600 hover:text-blue-900"
                >
                  History
                </button>
                <button
                  onClick={() => onEditEnvVars(app.name)}
                  className="text-green-600 hover:text-green-900"
                >
                  Env Vars
                </button>
                <button
                  onClick={() => onEditSettings(app.name)}
                  className="text-yellow-600 hover:text-yellow-900"
                >
                  Settings
                </button>
                <button
                  onClick={() => onDelete(app.name)}
                  className="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}