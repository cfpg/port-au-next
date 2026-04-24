import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import type { DbPool } from '../db/pool.js';
import { sha256Hex } from '../crypto/sha256.js';

export type TenantContext = { appId: number };

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantContext;
  }
}

export function createTenantAuth(pool: DbPool) {
  return async function tenantAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      await reply.code(401).send({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      await reply.code(401).send({ error: 'Missing API key' });
      return;
    }

    const lookup = sha256Hex(token);
    const r = await pool.query<{ app_id: number; api_key_hash: string }>(
      `SELECT app_id, api_key_hash FROM port_schedule.tenants WHERE api_key_sha256 = $1`,
      [lookup]
    );
    if (r.rowCount === 0) {
      await reply.code(401).send({ error: 'Invalid API key' });
      return;
    }
    const row = r.rows[0]!;
    const ok = await bcrypt.compare(token, row.api_key_hash);
    if (!ok) {
      await reply.code(401).send({ error: 'Invalid API key' });
      return;
    }
    request.tenant = { appId: row.app_id };
  };
}
