import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { aiService } from '../services/ai.service.js';
import { AI_PROVIDERS } from '@news-reader/shared';

const configureAISchema = z.object({
  provider: z.enum(AI_PROVIDERS).nullable(),
  apiKey: z.string().nullable(),
});

export default async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.post('/summarize/:articleId', {
    schema: { tags: ['AI'], summary: 'Summarize an article' },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const summary = await aiService.summarize(req.user.id, articleId);
    if (summary === null) {
      return reply.status(400).send({ error: 'AI not configured or summarization failed' });
    }
    return { summary };
  });

  app.post('/suggest-tags/:articleId', {
    schema: { tags: ['AI'], summary: 'Get AI-suggested tags for an article' },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const suggestions = await aiService.suggestTags(req.user.id, articleId);
    return { tags: suggestions };
  });

  app.get('/config', {
    schema: { tags: ['AI'], summary: 'Get AI configuration' },
  }, async (req) => {
    return aiService.getUserAIConfig(req.user.id);
  });

  app.put('/config', {
    schema: { tags: ['AI'], summary: 'Update AI configuration' },
  }, async (req, reply) => {
    const body = configureAISchema.parse(req.body);
    await aiService.updateUserAIConfig(req.user.id, body.provider, body.apiKey);
    return reply.status(204).send();
  });
}
