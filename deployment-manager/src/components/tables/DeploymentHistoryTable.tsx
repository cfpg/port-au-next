import { Deployment } from '~/types';
import { getStatusColor } from '~/utils/status';
import Table, {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../general/Table';
import getRelativeTime from '~/utils/getRelativeTime';
import getGithubRepoPath from '~/utils/getGithubRepoPath';
import Link from '../general/Link';
import Badge from '../general/Badge';

interface DeploymentHistoryTableProps {
  deployments: Deployment[];
}

export default function DeploymentHistoryTable({
  deployments,
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
            <TableHead className='text-right'>Actions</TableHead>
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
                <Badge className={getStatusColor(deployment.status)}>{deployment.status}</Badge>
              </TableCell>
              <TableCell>
                {new Date(deployment.deployed_at).toLocaleString()}
                {deployment.deployed_at && <span className="text-gray-400"> ({getRelativeTime(deployment.deployed_at)})</span>}
              </TableCell>
              <TableCell className="text-right font-medium">
                <Link
                  href={`?modalViewLogs=${deployment.id}&modalAppName=${deployment.app_name}`}
                  color="gray"
                  variant="button"
                  size="sm"
                >
                  <i className="fas fa-eye mr-2"></i>
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