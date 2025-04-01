import { Service, ServiceStatus } from '~/types';

const serviceColors: Record<Service, string> = {
  nginx: 'bg-emerald-500',    // Green for web server
  postgres: 'bg-blue-500',    // Blue for database
  redis: 'bg-red-500',        // Red for cache
  thumbor: 'bg-purple-500',   // Purple for image processing
} as const;

export function getServiceColor(serviceName: Service): string {
  return serviceColors[serviceName];
} 

export const getServiceStatusColor = (status: ServiceStatus) => {
  if (status === 'running') return 'green';
  if (status === 'stopped') return 'red';
  return 'gray';
}