import { Deployment } from '~/types';
import { getStatusColor } from '~/utils/status';
import Button from './general/Button';

interface DeploymentHistoryTableProps {
  deployments: Deployment[];
  onViewLogs: (version: string) => void;
}

export default function DeploymentHistoryTable({
  deployments,
  onViewLogs,
}: DeploymentHistoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              App
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Version
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Commit
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Deployed At
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {deployments.map((deployment) => (
            <tr key={deployment.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {deployment.app_name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {deployment.version}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {deployment.commit_id ? deployment.commit_id.substring(0, 7) : 'N/A'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(deployment.status)}`}>
                  {deployment.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(deployment.deployed_at).toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-left text-sm font-medium">
                <Button
                  onClick={() => onViewLogs(deployment.version)}
                  color="primary"
                  size="sm"
                >
                  View Logs
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}