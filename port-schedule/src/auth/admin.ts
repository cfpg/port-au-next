import type { FastifyReply, FastifyRequest } from 'fastify';

export function createAdminAuth(masterApiKey: string) {
  return async function adminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      await reply.code(401).send({ error: 'Missing or invalid Authorization header' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (token !== masterApiKey) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  };
}
