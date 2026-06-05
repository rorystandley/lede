import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchArticlesQuerySchema } from '@lede/shared';
import { articleService } from '../services/article.service.js';
import { savedSearchService } from '../services/saved-search.service.js';

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

const updateSavedSearchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  query: z.string().min(1).max(500).optional(),
  filters: z.object({
    feedIds: z.array(z.string().uuid()).optional(),
    folderIds: z.array(z.string().uuid()).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
  }).nullable().optional(),
  isMonitor: z.boolean().optional(),
});

export default async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', {
    schema: { tags: ['Search'], summary: 'Search articles' },
  }, async (req) => {
    const query = searchArticlesQuerySchema.parse(req.query);
    return articleService.search(req.user.id, query);
  });

  // --- Saved Searches ---

  app.get('/saved', {
    schema: { tags: ['Search'], summary: 'List saved searches' },
  }, async (req) => {
    return savedSearchService.listForUser(req.user.id);
  });

  app.post('/saved', {
    schema: { tags: ['Search'], summary: 'Create a saved search' },
  }, async (req, reply) => {
    const body = createSavedSearchSchema.parse(req.body);
    const saved = await savedSearchService.create(req.user.id, body);
    return reply.status(201).send(saved);
  });

  app.put('/saved/:id', {
    schema: { tags: ['Search'], summary: 'Update a saved search' },
  }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateSavedSearchSchema.parse(req.body);
    return savedSearchService.update(req.user.id, id, body);
  });

  app.delete('/saved/:id', {
    schema: { tags: ['Search'], summary: 'Delete a saved search' },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await savedSearchService.delete(req.user.id, id);
    return reply.status(204).send();
  });
}
