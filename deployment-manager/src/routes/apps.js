const express = require('express');
const router = express.Router();
const { setupAppDatabase } = require('../services/database');
const { updateNginxConfig } = require('../services/nginx');
const { cloneRepository, pullLatestChanges, getLatestCommit } = require('../services/git');
const { startContainer, stopContainer } = require('../services/docker');
const { pool } = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, 
             d.status as latest_status,
             d.deployed_at as latest_deployment_date
      FROM apps a
      LEFT JOIN LATERAL (
        SELECT id, status, deployed_at
        FROM deployments
        WHERE app_id = a.id
        ORDER BY deployed_at DESC
        LIMIT 1
      ) d ON true
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error(`Error in /api/apps endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, repo_url, branch = 'main', domain } = req.body;
    
    if (!name || !repo_url || !domain) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if app already exists
    const existingApp = await pool.query(
      'SELECT * FROM apps WHERE name = $1 OR domain = $2',
      [name, domain]
    );

    let isUpdate = false;
    if (existingApp.rows.length > 0) {
      const existing = existingApp.rows[0];
      if (existing.domain !== domain && existing.name === name) {
        return res.status(409).json({ error: `App with name "${name}" already exists` });
      }
      if (existing.domain === domain && existing.name !== name) {
        return res.status(409).json({ error: `Domain "${domain}" is already in use by app "${existing.name}"` });
      }
      
      // App exists with same name and domain - update it
      console.log(`Updating existing app ${name}`);
      isUpdate = true;
    }

    // Setup database (creates or updates)
    const dbCredentials = await setupAppDatabase(name);

    // Database operation (create or update)
    if (isUpdate) {
      await pool.query(
        `UPDATE apps 
         SET repo_url = $1, branch = $2, 
             db_name = $3, db_user = $4, db_password = $5
         WHERE name = $6`,
        [
          repo_url, branch,
          dbCredentials.dbName,
          dbCredentials.dbUser,
          dbCredentials.dbPassword,
          name
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO apps (
          name, repo_url, branch, domain, 
          db_name, db_user, db_password
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          name, repo_url, branch, domain,
          dbCredentials.dbName,
          dbCredentials.dbUser,
          dbCredentials.dbPassword
        ]
      );
    }

    // If we got here, database operations succeeded
    // Now setup git and nginx
    try {
      await cloneRepository(name, repo_url, branch);
      await updateNginxConfig(name, domain);
    } catch (setupError) {
      console.error(`Error setting up git/nginx: ${setupError.message}`);
      // We might want to add a status field to the apps table to mark this
      // as partially configured
    }

    res.status(isUpdate ? 200 : 201).json({
      message: isUpdate ? `App "${name}" updated successfully` : `App "${name}" created successfully`,
      name,
      repo_url,
      branch,
      domain
    });

  } catch (error) {
    console.error(`Error registering app: ${error.message}`);
    res.status(500).json({ error: 'Failed to register app' });
  }
});

router.get('/:name/deployments', async (req, res) => {
  const { name } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT d.* 
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      WHERE a.name = $1
      ORDER BY d.deployed_at DESC
    `, [name]);
    
    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching deployments for ${name}: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:name/deploy', async (req, res) => {
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

    // Start deployment record
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

        // Start new container with blue/green deployment
        const { containerId } = await startContainer(name, version, {
          POSTGRES_USER: app.db_user,
          POSTGRES_PASSWORD: app.db_password,
          POSTGRES_DB: app.db_name,
          POSTGRES_HOST: 'postgres'
        });

        // Get old container ID if exists
        const oldDeployment = await pool.query(
          `SELECT container_id FROM deployments 
           WHERE app_id = $1 AND status = 'active'`,
          [app.id]
        );

        // Update nginx config to point to new container
        await updateNginxConfig(name, app.domain, containerId);

        // Mark new deployment as active
        await pool.query(
          `UPDATE deployments 
           SET status = $1, commit_id = $2, container_id = $3 
           WHERE id = $4`,
          ['active', commitId, containerId, deploymentId]
        );

        // If there was a previous deployment, stop its container and mark as inactive
        if (oldDeployment.rows.length > 0) {
          const oldContainerId = oldDeployment.rows[0].container_id;
          await stopContainer(oldContainerId);
          
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