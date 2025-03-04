const { pool } = require('../config/database');
const crypto = require('crypto');

async function initializeDatabase() {
  try {
    console.log('Creating tables...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apps (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE,
        repo_url TEXT,
        branch TEXT DEFAULT 'main',
        domain TEXT,
        db_name TEXT,
        db_user TEXT,
        db_password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deployments (
        id SERIAL PRIMARY KEY,
        app_id INTEGER REFERENCES apps(id),
        commit_id TEXT,
        version TEXT,
        status TEXT,
        container_id TEXT,
        deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

async function setupAppDatabase(appName) {
  const dbUser = `${appName}_user`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbName = `${appName}_db`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbPassword = crypto.randomBytes(16).toString('hex');

  try {
    const rootPool = new Pool({
      ...dbConfig,
      database: 'postgres'
    });

    await rootPool.query(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
    await rootPool.query(`CREATE DATABASE ${dbName} OWNER ${dbUser}`);
    await rootPool.end();

    return { dbUser, dbName, dbPassword };
  } catch (error) {
    console.error(`Error setting up database for ${appName}:`, error);
    throw error;
  }
}

module.exports = {
  initializeDatabase,
  setupAppDatabase
}; 