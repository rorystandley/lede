import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTagSchema, updateTagSchema, tagArticleSchema } from '@news-reader/shared';
import { tagService } from '../services/tag.service.js';

const applyByNameSchema = z.object({
  names: z.array(z.string().min(1).max(100)).min(1).max(20),
  source: z.enum(['manual', 'ai', 'rule']).default('manual'),
});

export default async function tagRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', {
    schema: { tags: ['Tags'], summary: 'List tags with article counts' },
  }, async (req) => {
    return tagService.listForUser(req.user.id);
  });

  app.post('/', {
    schema: { tags: ['Tags'], summary: 'Create a tag' },
  }, async (req, reply) => {
    const body = createTagSchema.parse(req.body);
    const tag = await tagService.create(req.user.id, body.name, body.color);
    return reply.status(201).send(tag);
  });

  app.patch('/:tagId', {
    schema: { tags: ['Tags'], summary: 'Update a tag' },
  }, async (req) => {
    const { tagId } = req.params as { tagId: string };
    const body = updateTagSchema.parse(req.body);
    return tagService.update(req.user.id, tagId, body);
  });

  app.delete('/:tagId', {
    schema: { tags: ['Tags'], summary: 'Delete a tag' },
  }, async (req, reply) => {
    const { tagId } = req.params as { tagId: string };
    await tagService.delete(req.user.id, tagId);
    return reply.status(204).send();
  });

  app.put('/articles/:articleId', {
    schema: { tags: ['Tags'], summary: 'Set tags on an article' },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const body = tagArticleSchema.parse(req.body);
    await tagService.tagArticle(req.user.id, articleId, body.tagIds);
    return reply.status(204).send();
  });

  app.post('/articles/:articleId/by-name', {
    schema: { tags: ['Tags'], summary: 'Apply tags by name — upserts tags first then links to article' },
  }, async (req) => {
    const { articleId } = req.params as { articleId: string };
    const body = applyByNameSchema.parse(req.body);
    const applied = await tagService.applyTagsByName(req.user.id, articleId, body.names, body.source);
    return { applied };
  });
}
