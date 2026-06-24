export type PlatformServiceId =
  | 'deployment-manager'
  | 'imgproxy'
  | 'minio'
  | 'port-schedule'
  | 'umami'
  | 'bugsink';

export interface PlatformServiceDefinition {
  id: PlatformServiceId;
  label: string;
  envKey: string;
  required: boolean;
}

export const PLATFORM_SERVICE_HOSTS: PlatformServiceDefinition[] = [
  {
    id: 'deployment-manager',
    label: 'Deployment manager',
    envKey: 'DEPLOYMENT_MANAGER_HOST',
    required: true,
  },
  {
    id: 'imgproxy',
    label: 'imgproxy',
    envKey: 'IMGPROXY_HOST',
    required: true,
  },
  {
    id: 'minio',
    label: 'MinIO',
    envKey: 'MINIO_HOST',
    required: true,
  },
  {
    id: 'port-schedule',
    label: 'port-schedule',
    envKey: 'PORT_SCHEDULE_HOST',
    required: false,
  },
  {
    id: 'umami',
    label: 'Umami analytics',
    envKey: 'UMAMI_HOST',
    required: false,
  },
  {
    id: 'bugsink',
    label: 'Bugsink error tracking',
    envKey: 'BUGSINK_HOST',
    required: false,
  },
];

export function getPlatformServiceDefinition(
  serviceId: string
): PlatformServiceDefinition | undefined {
  return PLATFORM_SERVICE_HOSTS.find((service) => service.id === serviceId);
}

export function getPlatformServiceHostname(serviceId: PlatformServiceId): string | null {
  const definition = getPlatformServiceDefinition(serviceId);
  if (!definition) return null;
  const value = process.env[definition.envKey]?.trim();
  return value || null;
}

export function getPlatformServiceHostnameFromEnv(envKey: string): string | null {
  const value = process.env[envKey]?.trim();
  return value || null;
}
