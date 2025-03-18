interface Deployment {
  version: string;
  commit_id: string;
  status: 'success' | 'failed' | 'in_progress';
  active_container: string;
  deployed_at: string;
}

interface DeploymentHistoryTableProps {
  deployments: Deployment[];
  onViewLogs: (version: string) => void;
}

export default function DeploymentHistoryTable({
  deployments,
  onViewLogs,
}: DeploymentHistoryTableProps) {
  const getStatusColor = (status: Deployment['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
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
              Version
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Commit ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Active Container
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Deployed At
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {deployments.map((deployment) => (
            <tr key={deployment.version}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {deployment.version}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {deployment.commit_id}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(deployment.status)}`}>
                  {deployment.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {deployment.active_container}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(deployment.deployed_at).toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  onClick={() => onViewLogs(deployment.version)}
                  className="text-indigo-600 hover:text-indigo-900"
                >
                  View Logs
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}