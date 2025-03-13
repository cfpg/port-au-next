const express = require('express');
const path = require('path');
const { initializeDatabase } = require('./src/services/database');
const { appsRouter, deploymentsRouter } = require('./src/routes');
const { execCommand } = require('./src/services/docker');
const { startContainer } = require('./src/services/docker');
const { updateNginxConfig } = require('./src/services/docker');
const { pool } = require('./src/services/database');

// Configure paths and app
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Routes
app.use('/api/apps', appsRouter);
app.use('/api/deployments', deploymentsRouter);

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

// Startup sequence
async function startup() {
  try {
    console.log('Starting application...');
    await initializeDatabase();
    
    // Add recovery before starting the server
    await recoverContainers();
    
    app.listen(PORT, () => {
      console.log(`Deployment manager running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Startup failed:', error);
    console.error(error.stack);
  }
}

async function recoverContainers() {
  try {
    console.log('Recovering active containers...');
    const result = await pool.query(`
      SELECT a.name, a.domain, d.container_id, d.version
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      WHERE d.status = 'active'
    `);

    for (const deployment of result.rows) {
      try {
        // Check if container exists and get its status
        const containerStatus = await execCommand(
          `docker inspect -f '{{.State.Status}}' ${deployment.container_id}`
        ).catch(() => null);

        // Only recover if container is completely gone or is in a failed state
        // Don't recover if status is "running", "starting", "created"
        if (!containerStatus || containerStatus.trim() === 'exited' || containerStatus.trim() === 'dead') {
          console.log(`Recovering container for ${deployment.name}...`);
          
          // Double check after a delay to avoid race conditions with docker restart
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const retryStatus = await execCommand(
            `docker inspect -f '{{.State.Status}}' ${deployment.container_id}`
          ).catch(() => null);

          // Only proceed if container is still not running/starting
          if (!retryStatus || retryStatus.trim() === 'exited' || retryStatus.trim() === 'dead') {
            // Start new container with same version
            const { containerId } = await startContainer(
              deployment.name,
              deployment.version
            );

            // Update nginx config to point to new container
            await updateNginxConfig(
              deployment.name,
              deployment.domain,
              containerId
            );

            // Update deployment record with new container ID
            await pool.query(
              `UPDATE deployments 
               SET container_id = $1 
               WHERE container_id = $2`,
              [containerId, deployment.container_id]
            );

            console.log(`Successfully recovered ${deployment.name}`);
          } else {
            console.log(`Container ${deployment.name} recovered on its own, skipping...`);
          }
        } else {
          console.log(`Container ${deployment.name} is ${containerStatus.trim()}, no recovery needed`);
        }
      } catch (error) {
        console.error(`Failed to recover ${deployment.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Container recovery failed:', error);
  }
}

// Start the application
console.log('Launching application...');
startup();