interface Deployment {
  version: string;
  commit_id: string;
  status: string;
  container_id: string;
  deployed_at: Date;
}

interface DeploymentModalProps {
  appName: string;
  deployments: Deployment[];
  onViewLogs: (appName: string, deploymentId: number) => void;
}

export default function DeploymentModal({ appName, deployments, onViewLogs }: DeploymentModalProps) {
  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'building':
        return 'bg-blue-100 text-blue-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2 px-4 border-b border-gray-200 text-left text-sm font-semibold text-gray-700">Version</th>
            <th className="py-2 px-4 border-b border-gray-200 text-left text-sm font-semibold text-gray-700">Commit</th>
            <th className="py-2 px-4 border-b border-gray-200 text-left text-sm font-semibold text-gray-700">Status</th>
            <th className="py-2 px-4 border-b border-gray-200 text-left text-sm font-semibold text-gray-700">Container</th>
            <th className="py-2 px-4 border-b border-gray-200 text-left text-sm font-semibold text-gray-700">Deployed At</th>
            <th className="py-2 px-4 border-b border-gray-200 text-left text-sm font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {deployments.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-4 px-4 text-center text-gray-500">
                No deployments found
              </td>
            </tr>
          ) : (
            deployments.map((deployment) => (
              <tr key={deployment.version}>
                <td className="py-2 px-4 border-b border-gray-200">{deployment.version}</td>
                <td className="py-2 px-4 border-b border-gray-200">
                  {deployment.commit_id ? deployment.commit_id.substring(0, 7) : 'N/A'}
                </td>
                <td className="py-2 px-4 border-b border-gray-200">
                  <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${getStatusClass(deployment.status)}`}>
                    {deployment.status}
                  </span>
                </td>
                <td className="py-2 px-4 border-b border-gray-200">{deployment.container_id || 'N/A'}</td>
                <td className="py-2 px-4 border-b border-gray-200">
                  {new Date(deployment.deployed_at).toLocaleString()}
                </td>
                <td className="py-2 px-4 border-b border-gray-200">
                  <button
                    onClick={() => onViewLogs(appName, parseInt(deployment.version))}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    View Logs
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}