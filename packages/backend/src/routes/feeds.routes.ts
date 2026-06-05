import type { FastifyInstance } from 'fastify';
import { subscribeFeedSchema, updateSubscriptionSchema, listFeedsQuerySchema } from '@lede/shared';
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

  app.patch('/:feedId', {
    schema: {
      tags: ['Feeds'],
      summary: 'Update subscription (rename, move to folder)',
    },
  }, async (req, reply) => {
    const { feedId } = req.params as { feedId: string };
    const body = updateSubscriptionSchema.parse(req.body);
    await feedService.updateSubscription(req.user.id, feedId, body);
    return reply.status(204).send();
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

  app.post('/refresh-all', {
    schema: { tags: ['Feeds'], summary: 'Trigger refresh of all subscribed feeds' },
  }, async (req) => {
    const { getFeedRefreshQueue } = await import('../queues/index.js');
    const queue = getFeedRefreshQueue();
    const feedIds = await feedService.listSubscribedFeedIds(req.user.id);
    for (const feedId of feedIds) {
      await queue.add('refresh', { feedId });
    }
    return { queued: true, count: feedIds.length };
  });

  app.post('/:feedId/refresh', {
    schema: {
      tags: ['Feeds'],
      summary: 'Trigger immediate feed refresh',
    },
  }, async (req) => {
    const { feedId } = req.params as { feedId: string };
    return feedService.refreshFeed(feedId, { userId: req.user.id });
  });
}
