import pool from '~/services/database';
import {
  clearActiveRedactionSecrets,
  collectSecretValues,
  redactLogText,
  redactMetadata,
  setActiveRedactionSecrets,
} from '~/lib/redactLogs';

class Logger {
  private deploymentId: number | null;

  constructor() {
    this.deploymentId = null;
  }

  setDeploymentContext(deploymentId: number) {
    this.deploymentId = deploymentId;
  }

  clearDeploymentContext() {
    this.deploymentId = null;
    clearActiveRedactionSecrets();
  }

  setRedactionContext(env: Record<string, string>) {
    setActiveRedactionSecrets(collectSecretValues(env));
  }

  async log(type: string, message: string, metadata: Record<string, unknown> = {}) {
    try {
      const redactedMessage = redactLogText(message);
      const redactedMetadata = redactMetadata(metadata);

      const timestamp = new Date().toISOString();
      const consoleMessage = `[${timestamp}] [${type.toUpperCase()}] ${redactedMessage}`;

      switch (type) {
        case 'error':
          console.error(consoleMessage, redactedMetadata);
          break;
        case 'warning':
          console.warn(consoleMessage, redactedMetadata);
          break;
        case 'debug':
          console.debug(consoleMessage, redactedMetadata);
          break;
        default:
          console.log(consoleMessage, redactedMetadata);
      }

      const skipDbForDebug =
        type === 'debug' && process.env.NODE_ENV === 'production';

      if (this.deploymentId && !skipDbForDebug) {
        await pool.query(
          `INSERT INTO deployment_logs 
           (deployment_id, type, message, metadata) 
           VALUES ($1, $2, $3, $4)`,
          [
            this.deploymentId,
            type,
            redactedMessage,
            JSON.stringify(redactedMetadata),
          ]
        );
      }
    } catch (error) {
      console.error('Error saving log to database:', error);
    }
  }

  async info(message: string, metadata: Record<string, unknown> = {}) {
    return this.log('info', message, metadata);
  }

  async error(
    message: string,
    error: (Error & { code?: string; status?: string; headers?: unknown }) | null = null
  ) {
    const metadata = error
      ? {
          error: {
            message: error.message,
            stack: error.stack,
            code: (error as Error & { code?: string }).code || null,
            name: error.name,
          },
        }
      : {};
    return this.log('error', message, metadata);
  }

  async warning(message: string, metadata: Record<string, unknown> = {}) {
    return this.log('warning', message, metadata);
  }

  async debug(message: string, metadata: Record<string, unknown> = {}) {
    return this.log('debug', message, metadata);
  }
}

const logger = new Logger();
export default logger;
