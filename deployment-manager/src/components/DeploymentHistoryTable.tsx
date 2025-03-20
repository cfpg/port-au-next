import { Deployment } from '~/types';
import { getStatusColor } from '~/utils/status';
import Button from './general/Button';
import Table, {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './general/Table';
import getRelativeTime from '~/utils/getRelativeTime';
import getGithubRepoPath from '~/utils/getGithubRepoPath';
import Link from './general/Link';

interface DeploymentHistoryTableProps {
  deployments: Deployment[];
  onViewLogs?: (version: string) => void;
}

export default function DeploymentHistoryTable({
  deployments,
  onViewLogs,
}: DeploymentHistoryTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>App</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Commit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Deployed At</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deployments.map((deployment) => (
            <TableRow key={deployment.id}>
              <TableCell className="font-medium text-gray-900">
                {deployment.app_name}
              </TableCell>
              <TableCell>{deployment.version}</TableCell>
              <TableCell>
                {deployment.commit_id ? <a href={`https://github.com/${getGithubRepoPath(deployment.app_repository)}/commit/${deployment.commit_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">{deployment.commit_id.substring(0, 7)}</a> : 'N/A'}
              </TableCell>
              <TableCell>
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(deployment.status)}`}>
                  {deployment.status}
                </span>
              </TableCell>
              <TableCell>
                {new Date(deployment.deployed_at).toLocaleString()}
                {deployment.deployed_at && <span className="text-gray-400"> ({getRelativeTime(deployment.deployed_at)})</span>}
              </TableCell>
              <TableCell className="text-left font-medium">
                <Link
                  href={`?modalViewLogs=${deployment.id}`}
                  color="gray"
                  variant="button"
                >
                  View Logs
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}