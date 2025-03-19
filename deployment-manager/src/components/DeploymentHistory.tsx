import Table, {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/general/Table';
import Badge from '~/components/general/Badge';
import { Deployment } from '~/queries/fetchRecentDeploymentsQuery';

interface DeploymentHistoryProps {
  deployments: Deployment[];
}

export function DeploymentHistory({ deployments }: DeploymentHistoryProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Version</TableHead>
          <TableHead>Commit</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Deployed At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deployments.map((deployment) => (
          <TableRow key={deployment.id}>
            <TableCell>{deployment.version}</TableCell>
            <TableCell className="font-mono text-sm">
              {deployment.commit_id?.slice(0, 7)}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  deployment.status === 'active'
                    ? 'default'
                    : deployment.status === 'failed'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {deployment.status}
              </Badge>
            </TableCell>
            <TableCell>
              {new Date(deployment.deployed_at).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
} 