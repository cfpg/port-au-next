import { execCommand } from '~/utils/docker';

export const APPLICATION_DOCKER_NETWORK = 'port-au-next_port_au_next_network';

const DOCKER_DNS_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export function getDeploymentNetworkAlias(deploymentId: number): string {
  if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
    throw new Error(`Invalid deployment id for Docker network alias: ${deploymentId}`);
  }

  return `pan-deployment-${deploymentId}`;
}

export function assertDockerDnsName(value: string): string {
  const normalized = value.trim().replace(/^\//, '');
  if (!DOCKER_DNS_NAME_PATTERN.test(normalized)) {
    throw new Error(`Invalid Docker DNS name: ${value}`);
  }
  return normalized;
}

type DockerNetworkSettings = Record<
  string,
  {
    Aliases?: string[] | null;
  }
>;

/**
 * New containers use the immutable deployment alias. Containers created before
 * alias support keep routing through their Docker name until their next deploy.
 */
export async function getContainerRoutingHostname(
  containerId: string,
  deploymentId: number
): Promise<string> {
  const desiredAlias = getDeploymentNetworkAlias(deploymentId);
  const networksJson = (await execCommand(
    `docker inspect --format '{{json .NetworkSettings.Networks}}' ${containerId}`
  )) as string;
  const networks = JSON.parse(networksJson) as DockerNetworkSettings;
  const applicationNetwork = networks[APPLICATION_DOCKER_NETWORK];

  if (applicationNetwork?.Aliases?.includes(desiredAlias)) {
    return desiredAlias;
  }

  const containerName = (await execCommand(
    `docker inspect --format '{{.Name}}' ${containerId}`
  )) as string;
  return assertDockerDnsName(containerName);
}
