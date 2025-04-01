import { getServiceColor, getServiceStatusColor } from '~/utils/serviceColors';
import { ServiceHealth, Service, ServiceStatus } from '~/types';
import Card from '~/components/general/Card';
import Badge from '~/components/general/Badge';

interface ServiceCardProps {
  name: string;
  status: string;
  service: Service;
  id: string;
}

export default function ServiceCard({ name, status, service, id }: ServiceCardProps) {
  const color = getServiceColor(service);
  const shortId = id.slice(0, 8); // Show only first 8 characters of container ID

  return (
    <Card
      className="h-full"
      title={
        <div className="flex items-center space-x-3">
          <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white font-semibold text-sm`}>
            {service.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium text-gray-900 capitalize">{service}</span>
        </div>
      }
      content={
        <div className="space-y-2">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500">Container</span>
            <span className="text-sm font-medium text-gray-900 truncate" title={name}>
              {name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500" title={id}>ID: {shortId}</span>
            <Badge 
              color={getServiceStatusColor(status as ServiceStatus)}
              withDot
            >
              {status}
            </Badge>
          </div>
        </div>
      }
    />
  );
} 