const { pool } = require('../config/database');

class Logger {
  constructor() {
    this.deploymentId = null;
  }

  setDeploymentContext(deploymentId) {
    this.deploymentId = deploymentId;
  }

  clearDeploymentContext() {
    this.deploymentId = null;
  }

  async log(type, message, metadata = {}) {
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

  async info(message, metadata = {}) {
    return this.log('info', message, metadata);
  }

  async error(message, error = null) {
    const metadata = error ? {
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      }
    } : {};
    return this.log('error', message, metadata);
  }

  async warning(message, metadata = {}) {
    return this.log('warning', message, metadata);
  }

  async debug(message, metadata = {}) {
    return this.log('debug', message, metadata);
  }

  async getDeploymentLogs(deploymentId) {
    try {
      const result = await pool.query(
        `SELECT * FROM deployment_logs 
         WHERE deployment_id = $1 
         ORDER BY created_at ASC`,
        [deploymentId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching deployment logs:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
const logger = new Logger();
module.exports = logger; 