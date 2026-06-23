import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { execCommand } from '~/utils/docker';

const COMPOSE_PROJECT = 'port-au-next';
/** Bind-mounted into deployment-manager; readable by the compose CLI inside the container. */
const COMPOSE_FILE_IN_CONTAINER = '/app/docker-compose.yml';
const execAsync = promisify(exec);

let cachedHostProjectDir: string | null = null;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getSelfContainerIdFromCgroup(): string | null {
  try {
    const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
    for (const line of cgroup.trim().split('\n')) {
      const fullIdMatch = line.match(/docker[/-]([a-f0-9]{64})/i);
      if (fullIdMatch?.[1]) {
        return fullIdMatch[1];
      }

      const shortIdMatch = line.match(/docker[/-]([a-f0-9]{12})/i);
      if (shortIdMatch?.[1]) {
        return shortIdMatch[1];
      }
    }
  } catch {
    // Not running in a Linux container with cgroup access
  }

  return null;
}

function getSelfContainerIdFromHostnameFile(): string | null {
  try {
    const hostname = fs.readFileSync('/etc/hostname', 'utf8').trim();
    if (/^[a-f0-9]{12,64}$/i.test(hostname)) {
      return hostname;
    }
  } catch {
    // Ignore
  }

  return null;
}

async function getDeploymentManagerContainerId(): Promise<string> {
  const fromCgroup = getSelfContainerIdFromCgroup();
  if (fromCgroup) {
    return fromCgroup;
  }

  const fromHostnameFile = getSelfContainerIdFromHostnameFile();
  if (fromHostnameFile) {
    return fromHostnameFile;
  }

  const fromDockerPs = (
    await execCommand(
      `docker ps -q -f "label=com.docker.compose.service=deployment-manager" -f "label=com.docker.compose.project=${COMPOSE_PROJECT}"`
    )
  ).trim();

  const containerId = fromDockerPs.split('\n').find((line) => line.trim());
  if (containerId) {
    return containerId.trim();
  }

  throw new Error('Could not resolve deployment-manager container ID');
}

async function getMountSourceFromContainer(
  containerId: string,
  destination: string
): Promise<string | null> {
  const source = (
    await execCommand(
      `docker inspect -f '{{range .Mounts}}{{if eq .Destination "${destination}"}}{{.Source}}{{end}}{{end}}' ${containerId}`
    )
  ).trim();

  return source || null;
}

/**
 * Resolve the host project root from this container's bind mounts.
 * Required because compose runs inside deployment-manager with docker.sock.
 */
export async function getHostComposeProjectDir(): Promise<string> {
  if (cachedHostProjectDir) {
    return cachedHostProjectDir;
  }

  const containerId = await getDeploymentManagerContainerId();

  const nginxMountSource = await getMountSourceFromContainer(containerId, '/app/nginx');
  if (nginxMountSource) {
    cachedHostProjectDir = path.dirname(nginxMountSource);
    return cachedHostProjectDir;
  }

  const composeMountSource = await getMountSourceFromContainer(
    containerId,
    '/app/docker-compose.yml'
  );
  if (composeMountSource) {
    cachedHostProjectDir = path.dirname(composeMountSource);
    return cachedHostProjectDir;
  }

  throw new Error('Could not resolve host compose project directory from container mounts');
}

export function getComposeProjectName(): string {
  return COMPOSE_PROJECT;
}

/**
 * Find a running compose service container. Uses docker ps labels (reliable from
 * inside deployment-manager) with a fallback to bare `docker compose ps -q`.
 */
export async function getComposeServiceContainerId(
  serviceName: string
): Promise<string | null> {
  const fromLabels = (
    await execCommand(
      `docker ps -q -f "label=com.docker.compose.service=${serviceName}" -f "label=com.docker.compose.project=${COMPOSE_PROJECT}" -f "status=running"`
    ) as string
  ).trim();

  const fromLabelsId = fromLabels.split('\n').find((line: string) => line.trim());
  if (fromLabelsId) {
    return fromLabelsId.trim();
  }

  try {
    const fromComposePs = (
      await execCommand(`docker compose ps -q ${serviceName}`) as string
    ).trim();

    const fromComposeId = fromComposePs.split('\n').find((line: string) => line.trim());
    return fromComposeId?.trim() ?? null;
  } catch {
    return null;
  }
}

export type WaitForComposeServiceOptions = {
  /** Delay before each retry after the first immediate check (ms). Default: 2s, 4s, 6s, ... */
  delaysMs?: number[];
};

const DEFAULT_SERVICE_WAIT_DELAYS_MS = [2000, 4000, 6000, 8000, 10000, 12000];

/**
 * Poll until a compose service container is running. Checks immediately, then
 * waits 2s, 4s, 6s, ... between subsequent attempts.
 */
export async function waitForComposeService(
  serviceName: string,
  options: WaitForComposeServiceOptions = {}
): Promise<string | null> {
  const delaysMs = options.delaysMs ?? DEFAULT_SERVICE_WAIT_DELAYS_MS;

  const immediate = await getComposeServiceContainerId(serviceName);
  if (immediate) {
    return immediate;
  }

  for (const delayMs of delaysMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const containerId = await getComposeServiceContainerId(serviceName);
    if (containerId) {
      return containerId;
    }
  }

  return null;
}

/**
 * Run compose from inside deployment-manager. The compose file is read from the
 * container bind mount (`/app/docker-compose.yml`). Host project directory is
 * only passed for commands that create/recreate containers so relative volume
 * paths resolve on the host filesystem.
 */
export async function execCompose(subcommand: string): Promise<string> {
  const trimmed = subcommand.trim();
  const needsHostProjectDir = /^(up|down|create|run)\b/.test(trimmed);

  const commandParts = [
    'docker compose',
    `-p ${COMPOSE_PROJECT}`,
    `-f ${shellQuote(COMPOSE_FILE_IN_CONTAINER)}`,
  ];

  if (needsHostProjectDir) {
    const projectDir = await getHostComposeProjectDir();
    commandParts.push(`--project-directory ${shellQuote(projectDir)}`);
  }

  commandParts.push(subcommand);

  const { stdout } = await execAsync(commandParts.join(' '));
  return stdout;
}
