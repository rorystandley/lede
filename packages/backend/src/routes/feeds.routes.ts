import type { FastifyInstance } from 'fastify';
import { subscribeFeedSchema, updateSubscriptionSchema, listFeedsQuerySchema } from '@news-reader/shared';
import { feedService } from '../services/feed.service.js';

export default async function feedRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', {
    schema: {
      tags: ['Feeds'],
      summary: 'List subscribed feeds',
    },
  }, async (req) => {
    const query = listFeedsQuerySchema.parse(req.query);
    return feedService.listForUser(req.user.id, query);
  });

  app.post('/', {
    schema: {
      tags: ['Feeds'],
      summary: 'Subscribe to a feed',
    },
  }, async (req, reply) => {
    const body = subscribeFeedSchema.parse(req.body);
    const result = await feedService.subscribe(req.user.id, body.url, body.folderId, body.customTitle);
    return reply.status(201).send(result);
  });

  app.delete('/:feedId', {
    schema: {
      tags: ['Feeds'],
      summary: 'Unsubscribe from a feed',
    },
  }, async (req, reply) => {
    const { feedId } = req.params as { feedId: string };
    await feedService.unsubscribe(req.user.id, feedId);
    return reply.status(204).send();
  });

  app.post('/:feedId/refresh', {
    schema: {
      tags: ['Feeds'],
      summary: 'Trigger immediate feed refresh',
    },
  }, async (req) => {
    const { feedId } = req.params as { feedId: string };
    return feedService.refreshFeed(feedId);
  });
}
