import type { FastifyInstance } from 'fastify';
import { digestService } from '../services/digest.service.js';

export default async function digestRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/latest', {
    schema: { tags: ['Digests'], summary: 'Get latest digest' },
  }, async (req, reply) => {
    const digest = await digestService.getLatest(req.user.id);
    if (!digest) return reply.status(404).send({ error: 'No digest found' });
    return digest;
  });

  app.post('/build', {
    schema: { tags: ['Digests'], summary: 'Trigger digest build now' },
  }, async (req, reply) => {
    const digest = await digestService.buildDigest(req.user.id);
    return reply.status(201).send(digest);
  });

  app.get('/', {
    schema: { tags: ['Digests'], summary: 'List past digests' },
  }, async (req) => {
    return digestService.listForUser(req.user.id);
  });

  app.patch('/:digestId/delivered', {
    schema: { tags: ['Digests'], summary: 'Mark digest as delivered' },
  }, async (req, reply) => {
    const { digestId } = req.params as { digestId: string };
    await digestService.markDelivered(req.user.id, digestId);
    return reply.status(204).send();
  });
}
