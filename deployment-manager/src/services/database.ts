import { Pool, PoolConfig } from 'pg';

const config: PoolConfig = {
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
};

// Create a singleton pool instance
const pool = new Pool(config);

// Error handling for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;

// Helper function to get a client from the pool
export async function getClient() {
  const client = await pool.connect();
  return client;
}

// Helper function for transactions
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} 