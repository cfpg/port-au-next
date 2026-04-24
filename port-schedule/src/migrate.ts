import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DbPool } from './db/pool.js';

export async function runMigrations(pool: DbPool): Promise<void> {
  const sqlPath = path.join(process.cwd(), 'migrations', '001_init.sql');
  const sql = await readFile(sqlPath, 'utf8');
  await pool.query(sql);
}
