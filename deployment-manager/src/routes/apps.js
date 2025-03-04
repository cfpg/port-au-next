const express = require('express');
const router = express.Router();
const { setupAppDatabase } = require('../services/database');
const { updateNginxConfig } = require('../services/nginx');
const { cloneRepository } = require('../services/git');
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

module.exports = router; 