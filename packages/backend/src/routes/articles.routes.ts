import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listArticlesQuerySchema,
  markArticlesReadSchema,
  starArticleSchema,
  archiveArticleSchema,
  searchArticlesQuerySchema,
} from '@news-reader/shared';
import { articleService } from '../services/article.service.js';
import { extractionService } from '../services/extraction.service.js';

const markAllReadSchema = z.object({
  feedId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
});

export default async function articleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', {
    schema: {
      tags: ['Articles'],
      summary: 'List articles with filters',
    },
  }, async (req) => {
    const query = listArticlesQuerySchema.parse(req.query);
    return articleService.list(req.user.id, query);
  });

  app.get('/search', {
    schema: {
      tags: ['Articles'],
      summary: 'Full-text search articles',
    },
  }, async (req) => {
    const query = searchArticlesQuerySchema.parse(req.query);
    return articleService.search(req.user.id, query);
  });

  app.get('/:articleId', {
    schema: {
      tags: ['Articles'],
      summary: 'Get article by ID',
    },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const article = await articleService.getById(req.user.id, articleId);
    if (!article) return reply.status(404).send({ error: 'Article not found' });
    return article;
  });

  app.post('/:articleId/extract', {
    schema: { tags: ['Articles'], summary: 'Re-extract full article content from URL' },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const result = await extractionService.extractNow(articleId);

    if (result.status === 'failed') {
      return reply.status(422).send({
        status: 'failed',
        error: 'Could not get anything useful from the article URL — the site may block scrapers or require JavaScript.',
      });
    }

    // Both 'full' and 'metadata' results updated the row — refetch and include the status.
    const fresh = await articleService.getById(req.user.id, articleId);
    return reply.send({ ...fresh, extractionStatus: result.status });
  });

  app.post('/mark-all-read', {
    schema: { tags: ['Articles'], summary: 'Mark all unread articles in a scope as read' },
  }, async (req) => {
    const body = markAllReadSchema.parse(req.body ?? {});
    const marked = await articleService.markAllRead(req.user.id, body);
    return { marked };
  });

  app.post('/mark-read', {
    schema: {
      tags: ['Articles'],
      summary: 'Mark articles as read',
    },
  }, async (req, reply) => {
    const body = markArticlesReadSchema.parse(req.body);
    await articleService.markRead(req.user.id, body.articleIds);
    return reply.status(204).send();
  });

  app.post('/mark-unread', {
    schema: {
      tags: ['Articles'],
      summary: 'Mark articles as unread',
    },
  }, async (req, reply) => {
    const body = markArticlesReadSchema.parse(req.body);
    await articleService.markUnread(req.user.id, body.articleIds);
    return reply.status(204).send();
  });

  app.patch('/:articleId/star', {
    schema: {
      tags: ['Articles'],
      summary: 'Star or unstar an article',
    },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const body = starArticleSchema.parse(req.body);
    await articleService.setStar(req.user.id, articleId, body.isStarred);
    return reply.status(204).send();
  });

  app.patch('/:articleId/archive', {
    schema: {
      tags: ['Articles'],
      summary: 'Archive or unarchive an article',
    },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const body = archiveArticleSchema.parse(req.body);
    await articleService.setArchived(req.user.id, articleId, body.isArchived);
    return reply.status(204).send();
  });
}
