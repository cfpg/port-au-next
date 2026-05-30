export const IN_FLIGHT_DEPLOYMENT_STATUSES = [
  'pending',
  'building',
  'preflight',
  'migrating',
] as const;

export function isDeploymentInFlight(status: string): boolean {
  return (IN_FLIGHT_DEPLOYMENT_STATUSES as readonly string[]).includes(status);
}
