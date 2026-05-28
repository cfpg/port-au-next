import * as fs from 'fs';
import * as path from 'path';

import logger from '~/services/logger';
import { execCommand } from '~/utils/docker';
import getAppsDir from '~/utils/getAppsDir';
import { formatDockerEnvString } from '~/utils/dockerEnv';

const networkName = 'port-au-next_port_au_next_network';

export function migratorImageTag(appName: string, version: string): string {
  return `${appName}:${version}-migrate`;
}

export function hasPrismaMigrationsDir(appName: string): boolean {
  const migrationsPath = path.join(getAppsDir(), appName, 'prisma', 'migrations');
  if (!fs.existsSync(migrationsPath)) {
    return false;
  }
  try {
    return fs.readdirSync(migrationsPath).some((entry) => {
      const full = path.join(migrationsPath, entry);
      return fs.statSync(full).isDirectory();
    });
  } catch {
    return false;
  }
}

export async function runPrismaMigrations(
  appName: string,
  version: string,
  appEnv: Record<string, string>
): Promise<void> {
  if (!hasPrismaMigrationsDir(appName)) {
    await logger.warning(
      'auto_migrate enabled but prisma/migrations not found; skipping database migrations',
      { phase: 'migrate', appName }
    );
    return;
  }

  const imageTag = migratorImageTag(appName, version);
  const envString = formatDockerEnvString(appEnv);
  const migrateCmd =
    'npx prisma migrate status && npx prisma migrate deploy';

  await logger.info('Phase: migrate — running prisma migrate status and deploy', {
    phase: 'migrate',
    imageTag,
  });

  const output = (await execCommand(
    `docker run --rm --network ${networkName} ${envString} ${imageTag} sh -c ${JSON.stringify(migrateCmd)}`
  )) as string;

  if (output.trim()) {
    await logger.info('Prisma migrate output', {
      phase: 'migrate',
      output: output.trim(),
    });
  }

  await logger.info('Phase: migrate — completed successfully', { phase: 'migrate' });
}
