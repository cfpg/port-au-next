const express = require('express');
const path = require('path');
const { initializeDatabase } = require('./src/services/database');
const { appsRouter, deploymentsRouter } = require('./src/routes');
const docker = require('./src/services/docker');

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
    
    // Try and recover stopped containers that should be running
    docker.recoverContainers();
    
    app.listen(PORT, () => {
      console.log(`Deployment manager running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Startup failed:', error);
    console.error(error.stack);
  }
}

// Start the application
console.log('Launching application...');
startup();