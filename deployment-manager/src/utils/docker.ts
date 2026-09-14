import { exec } from 'child_process';
import logger from '~/services/logger';
import {
  getActiveRedactionSecrets,
  redactLogText,
  withAdditionalRedactionSecrets,
} from '~/lib/redactLogs';

function getPlatformSecrets(): string[] {
  return [
    process.env.MINIO_ROOT_USER,
    process.env.MINIO_ROOT_PASSWORD,
    process.env.POSTGRES_PASSWORD,
    process.env.DEPLOYMENT_MANAGER_AUTH_PASSWORD,
    process.env.PORT_SCHEDULE_MASTER_API_KEY,
    process.env.UMAMI_ADMIN_PASSWORD,
    process.env.UMAMI_APP_SECRET,
    process.env.UMAMI_DB_PASSWORD,
    process.env.BUGSINK_ADMIN_PASSWORD,
    process.env.BUGSINK_SECRET_KEY,
    process.env.BUGSINK_DB_PASSWORD,
    process.env.BUGSINK_API_TOKEN,
    process.env.BETTER_AUTH_SECRET,
  ].filter((value): value is string => Boolean(value));
}

export async function execCommand(
  command: string,
  options: { redactionSecrets?: string[] } = {}
) {
  const redactionSecrets = withAdditionalRedactionSecrets([
    ...getActiveRedactionSecrets(),
    ...getPlatformSecrets(),
    ...(options.redactionSecrets ?? []),
  ]);
  const redactedCommand = redactLogText(command, redactionSecrets);

  return new Promise((resolve, reject) => {
    logger.debug('Executing command', { command: redactedCommand });
    exec(command, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        const redactedError = new Error(
          redactLogText(error.message, redactionSecrets)
        ) as Error & { code?: string };
        redactedError.name = error.name;
        redactedError.stack = error.stack
          ? redactLogText(error.stack, redactionSecrets)
          : undefined;
        redactedError.code = (error as Error & { code?: string }).code;
        logger.error('Command execution failed', redactedError);
        logger.error(
          'Command execution failed',
          new Error(redactLogText(stderr, redactionSecrets))
        );
        reject(redactedError);
      } else {
        resolve(stdout);
      }
    });
  });
}
