const { Pool } = require('pg');

const dbConfig = {
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: 'postgres',
  database: process.env.POSTGRES_DB,
  port: 5432
};

module.exports = {
  dbConfig,
  pool: new Pool(dbConfig)
}; 