import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import logger from '~/services/logger';
import { formatDockerEnvString } from '~/utils/dockerEnv';

const execAsync = promisify(exec);
const networkName = 'port-au-next_port_au_next_network';

export function migratorImageTag(appName: string, version: string): string {
  return `${appName}:${version}-migrate`;
}

export function hasPrismaMigrationsDir(projectDir: string): boolean {
  const migrationsPath = path.join(projectDir, 'prisma', 'migrations');
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

type MigratorCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runMigratorCommand(
  imageTag: string,
  envString: string,
  shellCmd: string
): Promise<MigratorCommandResult> {
  const command = `docker run --rm --network ${networkName} ${envString} ${imageTag} sh -c ${JSON.stringify(shellCmd)}`;
  await logger.debug('Executing migrator command', { phase: 'migrate', imageTag, shellCmd });

  try {
    const { stdout, stderr } = await execAsync(command);
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number | string };
    const exitCode =
      typeof err.code === 'number' ? err.code : 1;
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode,
    };
  }
}

function formatMigratorOutput(result: MigratorCommandResult): string {
  return [result.stdout, result.stderr].filter((part) => part.trim()).join('\n').trim();
}

async function logMigratorResult(
  message: string,
  step: 'status' | 'deploy',
  result: MigratorCommandResult
): Promise<void> {
  const output = formatMigratorOutput(result);
  await logger.info(message, {
    phase: 'migrate',
    step,
    exitCode: result.exitCode,
    output: output || '(no output)',
  });
}

export async function runPrismaMigrations(
  appName: string,
  version: string,
  appEnv: Record<string, string>,
  projectDir: string
): Promise<void> {
  if (!hasPrismaMigrationsDir(projectDir)) {
    await logger.warning(
      'auto_migrate enabled but prisma/migrations not found; skipping database migrations',
      { phase: 'migrate', appName }
    );
    return;
  }

  const imageTag = migratorImageTag(appName, version);
  const envString = formatDockerEnvString(appEnv);

  const statusResult = await runMigratorCommand(
    imageTag,
    envString,
    'npx prisma migrate status'
  );
  await logMigratorResult(
    'Phase: migrate — prisma migrate status (informational, does not gate deploy)',
    'status',
    statusResult
  );

  const deployResult = await runMigratorCommand(
    imageTag,
    envString,
    'npx prisma migrate deploy'
  );
  await logMigratorResult(
    'Phase: migrate — prisma migrate deploy',
    'deploy',
    deployResult
  );

  if (deployResult.exitCode !== 0) {
    throw new Error(
      `prisma migrate deploy failed with exit code ${deployResult.exitCode}`
    );
  }

  await logger.info('Phase: migrate — completed successfully', { phase: 'migrate' });
}
