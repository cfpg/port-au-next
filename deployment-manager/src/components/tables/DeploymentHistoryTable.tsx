import { App, Deployment, ServiceStatus } from '~/types';
import Table, {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/general/Table';
import getRelativeTime from '~/utils/getRelativeTime';
import getGithubRepoPath from '~/utils/getGithubRepoPath';
import Badge from '~/components/general/Badge';
import { getServiceStatusColor } from '~/utils/serviceColors';
import ViewLogsButton from '~/components/deployments/ViewLogsButton';
import Link from '~/components/general/Link';
import AppDeployButton from '~/components/buttons/AppDeployButton';

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
            <TableHead>Branch</TableHead>
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
                <Link href={`/apps/${deployment.app_name}/deployments/${deployment.id}`}>
                  {deployment.app_name}
                </Link>
              </TableCell>
              <TableCell>{deployment.version}</TableCell>
              <TableCell>{deployment.branch || 'main'}</TableCell>
              <TableCell>
                {deployment.commit_id ? <a href={`https://github.com/${getGithubRepoPath(deployment.app_repository)}/commit/${deployment.commit_id}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">{deployment.commit_id.substring(0, 7)}</a> : 'N/A'}
              </TableCell>
              <TableCell>
                <Badge color={getServiceStatusColor(deployment.status as ServiceStatus)} withDot>{deployment.status}</Badge>
              </TableCell>
              <TableCell>
                {new Date(deployment.deployed_at).toLocaleString()}
                {deployment.deployed_at && <span className="text-gray-400"> ({getRelativeTime(deployment.deployed_at)})</span>}
              </TableCell>
              <TableCell className="font-medium flex justify-end space-x-2">
                <AppDeployButton app={{ name: deployment.app_name, id: deployment.app_id } as App} branch={deployment.branch} />
                <ViewLogsButton
                  deploymentId={deployment.id}
                  appName={deployment.app_name}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}