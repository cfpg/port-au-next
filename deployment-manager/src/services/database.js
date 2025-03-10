const { pool } = require('../config/database');
const { Pool } = require('pg');
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_env_vars (
        id SERIAL PRIMARY KEY,
        app_id INTEGER REFERENCES apps(id),
        branch TEXT,
        key TEXT,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(app_id, branch, key)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS deployment_logs (
        id SERIAL PRIMARY KEY,
        deployment_id INTEGER REFERENCES deployments(id),
        type TEXT CHECK (type IN ('info', 'error', 'warning', 'debug')),
        message TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

async function checkDatabaseExists(dbName, tempPool) {
  const result = await tempPool.query(`
    SELECT 1 FROM pg_database WHERE datname = $1
  `, [dbName]);
  return result.rows.length > 0;
}

async function checkUserExists(dbUser, tempPool) {
  const result = await tempPool.query(`
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1
  `, [dbUser]);
  return result.rows.length > 0;
}

async function setupAppDatabase(appName) {
  const dbUser = `${appName}_user`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbName = `${appName}_db`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbPassword = crypto.randomBytes(16).toString('hex');

  try {
    const tempPool = new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      host: 'postgres',
      database: 'postgres',
      port: 5432
    });

    // Check if user exists
    const userExists = await checkUserExists(dbUser, tempPool);
    
    if (!userExists) {
      console.log(`Creating database user ${dbUser}...`);
      await tempPool.query(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
    } else {
      console.log(`User ${dbUser} already exists, updating password...`);
      // Use ALTER USER instead of CREATE USER for existing users
      await tempPool.query(`ALTER USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
    }

    // Check if database exists
    const dbExists = await checkDatabaseExists(dbName, tempPool);
    if (!dbExists) {
      console.log(`Creating database ${dbName}...`);
      await tempPool.query(`CREATE DATABASE ${dbName} OWNER ${dbUser}`);
    } else {
      console.log(`Database ${dbName} already exists, ensuring correct owner...`);
      // Need to disconnect all users before changing owner
      await tempPool.query(`
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `, [dbName]);
      await tempPool.query(`ALTER DATABASE ${dbName} OWNER TO ${dbUser}`);
    }

    await tempPool.end();

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