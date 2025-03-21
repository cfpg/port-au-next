import Table, { TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/general/Table";
import { ServiceHealth, ServiceStatus } from "~/types";
import Badge from "../general/Badge";

interface ServicesHealthTableProps {
  servicesHealth: ServiceHealth[];
}

const getServiceStatusColor = (status: ServiceStatus) => {
  if (status === 'running') return 'green';
  if (status === 'stopped') return 'red';
  return 'gray';
}

const ServicesHealthTable = ({ servicesHealth }: ServicesHealthTableProps) => {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Container Name</TableHead>
            <TableHead>Container ID</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {servicesHealth.map((service) => (<TableRow key={service.id}>
            <TableCell>{service.service}</TableCell>
            <TableCell>{service.name}</TableCell>
            <TableCell>{service.id}</TableCell>
            <TableCell className="text-right">
              <Badge color={getServiceStatusColor(service.status)}>{service.status}</Badge>
            </TableCell>
          </TableRow>))}
        </TableBody>
      </Table>
    </div>
  );
}

export default ServicesHealthTable;
