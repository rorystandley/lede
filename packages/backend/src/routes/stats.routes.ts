import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { statsService } from '../services/stats.service.js';

export default async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/summary', {
    schema: { tags: ['Stats'], summary: 'Get reading summary stats' },
  }, async (req) => {
    return statsService.getSummary(req.user.id);
  });

  app.get('/daily', {
    schema: { tags: ['Stats'], summary: 'Get daily reading stats' },
  }, async (req) => {
    const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    return statsService.getDailyStats(req.user.id, query.days);
  });

  app.post('/track', {
    schema: { tags: ['Stats'], summary: 'Track reading time' },
  }, async (req, reply) => {
    const body = z.object({
      articleId: z.string().uuid(),
      readingTimeMs: z.number().int().min(0),
    }).parse(req.body);
    await statsService.recordArticleRead(req.user.id, body.articleId, body.readingTimeMs);
    return reply.status(204).send();
  });
}
