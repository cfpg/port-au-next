export function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'running':
    case 'success':
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'stopped':
      return 'bg-gray-100 text-gray-800';
    case 'error':
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'pending':
    case 'building':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
} 