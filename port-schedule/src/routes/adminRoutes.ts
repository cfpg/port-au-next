import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import type { DbPool } from '../db/pool.js';
import { sha256Hex } from '../crypto/sha256.js';

export async function registerAdminRoutes(app: FastifyInstance, pool: DbPool) {
  app.put<{ Params: { appId: string }; Body: { apiKey?: string } }>(
    '/admin/apps/:appId/credentials',
    async (request, reply) => {
      const appId = parseInt(request.params.appId, 10);
      if (Number.isNaN(appId) || appId < 1) {
        return reply.code(400).send({ error: 'Invalid app id' });
      }
      const apiKey = request.body?.apiKey?.trim();
      if (!apiKey || apiKey.length < 16) {
        return reply.code(400).send({ error: 'apiKey is required (min 16 chars)' });
      }

      const api_key_hash = await bcrypt.hash(apiKey, 10);
      const api_key_sha256 = sha256Hex(apiKey);

      await pool.query(
        `INSERT INTO port_schedule.tenants (app_id, api_key_hash, api_key_sha256)
         VALUES ($1, $2, $3)
         ON CONFLICT (app_id) DO UPDATE SET
           api_key_hash = EXCLUDED.api_key_hash,
           api_key_sha256 = EXCLUDED.api_key_sha256,
           updated_at = now()`,
        [appId, api_key_hash, api_key_sha256]
      );

      return reply.code(204).send();
    }
  );
}
