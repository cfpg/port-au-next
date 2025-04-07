import { Service, ServiceStatus } from '~/types';

const serviceColors: Record<Service, string> = {
  nginx: 'bg-emerald-500',    // Green for web server
  postgres: 'bg-blue-500',    // Blue for database
  redis: 'bg-red-500',        // Red for cache
  thumbor: 'bg-purple-500',   // Purple for image processing
  minio: 'bg-orange-500',     // Orange for object storage
} as const;

export function getServiceColor(serviceName: Service): string {
  return serviceColors[serviceName];
} 

export const getServiceStatusColor = (status: ServiceStatus) => {
  switch (status.toLowerCase()) {
    case 'running':
    case 'success':
    case 'active':
      return 'green';
    case 'stopped':
      return 'gray';
    case 'error':
    case 'failed':
      return 'red';
    case 'pending':
    case 'building':
      return 'yellow';
    default:
      return 'gray';
  }
}