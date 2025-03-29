import pool from '~/services/database';

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
  }

  async log(type: string, message: string, metadata: Record<string, any> = {}) {
    try {
      // Always log to console first
      const timestamp = new Date().toISOString();
      const consoleMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
      
      switch (type) {
        case 'error':
          console.error(consoleMessage, metadata);
          break;
        case 'warning':
          console.warn(consoleMessage, metadata);
          break;
        case 'debug':
          console.debug(consoleMessage, metadata);
          break;
        default:
          console.log(consoleMessage, metadata);
      }

      // If we have a deployment context, also log to database
      if (this.deploymentId) {
        await pool.query(
          `INSERT INTO deployment_logs 
           (deployment_id, type, message, metadata) 
           VALUES ($1, $2, $3, $4)`,
          [this.deploymentId, type, message, JSON.stringify(metadata)]
        );
      }
    } catch (error) {
      // If we can't log to the database, at least log to console
      console.error('Error saving log to database:', error);
    }
  }

  async info(message: string, metadata: Record<string, any> = {}) {
    return this.log('info', message, metadata);
  }

  async error(message: string, error: (Error & { code?: string; status?: string; headers?: any; stdout?: string; stderr?: string; statusText?: string; error?: string }) | null = null) {
    const metadata = error ? {
      error: {
        message: error.message,
        stack: error.stack,
        code: (error as any).code || null,
        name: error.name,
        stdout: error.stdout,
        stderr: error.stderr,
      }
    } : {};
    return this.log('error', message, metadata);
  }

  async warning(message: string, metadata: Record<string, any> = {}) {
    return this.log('warning', message, metadata);
  }

  async debug(message: string, metadata: Record<string, any> = {}) {
    return this.log('debug', message, metadata);
  }
}

// Create and export singleton instance
const logger = new Logger();
export default logger;
