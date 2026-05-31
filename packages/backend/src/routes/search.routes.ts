import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchArticlesQuerySchema } from '@news-reader/shared';
import { articleService } from '../services/article.service.js';

const createSavedSearchSchema = z.object({
  name: z.string().min(1).max(200),
  query: z.string().min(1).max(500),
  filters: z.object({
    feedIds: z.array(z.string().uuid()).optional(),
    folderIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
  }).optional(),
  isMonitor: z.boolean().default(false),
});

export default async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', {
    schema: { tags: ['Search'], summary: 'Search articles' },
  }, async (req) => {
    const query = searchArticlesQuerySchema.parse(req.query);
    return articleService.search(req.user.id, query);
  });
}
