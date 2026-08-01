import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { annotationService } from '../services/annotation.service.js';

const createAnnotationSchema = z.object({
  articleId: z.string().uuid(),
  type: z.enum(['highlight', 'note']),
  content: z.string().optional(),
  startOffset: z.number().int().optional(),
  endOffset: z.number().int().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export default async function annotationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/articles/:articleId', {
    schema: { tags: ['Annotations'], summary: 'List annotations for an article' },
  }, async (req) => {
    const { articleId } = req.params as { articleId: string };
    return annotationService.listForArticle(req.user.id, articleId);
  });

  app.post('/', {
    schema: { tags: ['Annotations'], summary: 'Create an annotation' },
  }, async (req, reply) => {
    const body = createAnnotationSchema.parse(req.body);
    const annotation = await annotationService.create(req.user.id, body.articleId, body);
    return reply.status(201).send(annotation);
  });

  app.patch('/:annotationId', {
    schema: { tags: ['Annotations'], summary: 'Update an annotation' },
  }, async (req) => {
    const { annotationId } = req.params as { annotationId: string };
    const body = z.object({
      content: z.string().optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }).parse(req.body);
    return annotationService.update(req.user.id, annotationId, body);
  });

  app.delete('/:annotationId', {
    schema: { tags: ['Annotations'], summary: 'Delete an annotation' },
  }, async (req, reply) => {
    const { annotationId } = req.params as { annotationId: string };
    await annotationService.delete(req.user.id, annotationId);
    return reply.status(204).send();
  });
}
