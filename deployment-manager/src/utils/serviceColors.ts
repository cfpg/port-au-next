import { ServiceStatus } from '~/types';

export const getServiceStatusTone = (status: ServiceStatus) => {
  switch (status.toLowerCase()) {
    case 'running':
    case 'success':
    case 'active':
      return 'success';
    case 'stopped':
      return 'idle';
    case 'error':
    case 'failed':
      return 'danger';
    case 'pending':
    case 'building':
    case 'preflight':
    case 'migrating':
      return 'warning';
    default:
      return 'idle';
  }
}