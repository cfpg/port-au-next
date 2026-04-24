import pg from 'pg';
import type { loadAppConfig } from '../config.js';

const { Pool } = pg;

export function createPool(connectionString: string) {
  return new Pool({ connectionString, max: 20 });
}

export type DbPool = ReturnType<typeof createPool>;

export type AppConfig = ReturnType<typeof loadAppConfig>;
