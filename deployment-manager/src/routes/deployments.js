const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { pullLatestChanges, getLatestCommit } = require('../services/git');
const { startContainer, stopContainer } = require('../services/docker');
const { updateNginxConfig } = require('../services/nginx');

router.get('/recent', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, a.name as app_name
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      ORDER BY d.deployed_at DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(`Error in /api/deployments/recent endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/apps/:name/deploy', async (req, res) => {
  const { name } = req.params;
  
  try {
    // Get app details
    const appResult = await pool.query(
      'SELECT * FROM apps WHERE name = $1',
      [name]
    );
    
    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    const app = appResult.rows[0];
    const version = new Date().toISOString().replace(/[^0-9]/g, '');

    // Start deployment
    const deploymentResult = await pool.query(
      `INSERT INTO deployments (app_id, version, status)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [app.id, version, 'pending']
    );
    
    const deploymentId = deploymentResult.rows[0].id;

    // Async deployment process
    (async () => {
      try {
        // Update status to building
        await pool.query(
          'UPDATE deployments SET status = $1 WHERE id = $2',
          ['building', deploymentId]
        );

        // Pull latest changes and get commit ID
        await pullLatestChanges(name, app.branch);
        const commitId = await getLatestCommit(name);

        // Start new container
        const { containerId, containerName } = await startContainer(name, version, {
          POSTGRES_USER: app.db_user,
          POSTGRES_PASSWORD: app.db_password,
          POSTGRES_DB: app.db_name,
          POSTGRES_HOST: 'postgres'
        });

        // Update nginx config
        await updateNginxConfig(name, app.domain, containerId);

        // Get old container ID if exists
        const oldDeployment = await pool.query(
          `SELECT container_id FROM deployments 
           WHERE app_id = $1 AND status = 'active'`,
          [app.id]
        );

        // Update deployment record
        await pool.query(
          `UPDATE deployments 
           SET status = $1, commit_id = $2, container_id = $3 
           WHERE id = $4`,
          ['active', commitId, containerId, deploymentId]
        );

        // Stop old container if exists
        if (oldDeployment.rows.length > 0) {
          const oldContainerId = oldDeployment.rows[0].container_id;
          await stopContainer(oldContainerId);
          
          // Update old deployment status
          await pool.query(
            `UPDATE deployments 
             SET status = 'inactive' 
             WHERE container_id = $1`,
            [oldContainerId]
          );
        }
      } catch (error) {
        console.error(`Deployment error for ${name}:`, error);
        await pool.query(
          'UPDATE deployments SET status = $1 WHERE id = $2',
          ['failed', deploymentId]
        );
      }
    })();

    res.json({ 
      message: 'Deployment started', 
      deploymentId, 
      version 
    });
  } catch (error) {
    console.error(`Error initiating deployment: ${error.message}`);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

module.exports = router; 