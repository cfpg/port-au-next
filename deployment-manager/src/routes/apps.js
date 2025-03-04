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
      LEFT JOIN deployments d ON d.app_id = a.id
      WHERE d.id = (
        SELECT id FROM deployments 
        WHERE app_id = a.id 
        ORDER BY deployed_at DESC 
        LIMIT 1
      )
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

    const dbCredentials = await setupAppDatabase(name);
    const result = await pool.query(
      `INSERT INTO apps (
        name, repo_url, branch, domain, 
        db_name, db_user, db_password
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING id`,
      [
        name, repo_url, branch, domain,
        dbCredentials.dbName,
        dbCredentials.dbUser,
        dbCredentials.dbPassword
      ]
    );

    await cloneRepository(name, repo_url, branch);
    await updateNginxConfig(name, domain);

    res.status(201).json({
      id: result.rows[0].id,
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

module.exports = router; 