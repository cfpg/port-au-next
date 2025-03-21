const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

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

module.exports = router; 