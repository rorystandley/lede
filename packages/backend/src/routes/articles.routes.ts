import type { FastifyInstance } from 'fastify';
import {
  listArticlesQuerySchema,
  markArticlesReadSchema,
  starArticleSchema,
  archiveArticleSchema,
  searchArticlesQuerySchema,
} from '@news-reader/shared';
import { articleService } from '../services/article.service.js';

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
