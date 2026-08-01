import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles, feeds, userFeedSubscriptions } from '../db/schema/index.js';

export default async function sharingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/article/:articleId', {
    schema: { tags: ['Sharing'], summary: 'Get shareable article data' },
  }, async (req, reply) => {
    const { articleId } = req.params as { articleId: string };
    const db = getDb();

    const [row] = await db
      .select({
        title: articles.title,
        url: articles.url,
        author: articles.author,
        summary: articles.summary,
        publishedAt: articles.publishedAt,
        feedTitle: feeds.title,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        userFeedSubscriptions,
        and(
          eq(userFeedSubscriptions.feedId, articles.feedId),
          eq(userFeedSubscriptions.userId, req.user.id),
        ),
      )
      .where(eq(articles.id, articleId));

    if (!row) return reply.status(404).send({ error: 'Article not found' });

    return {
      title: row.title,
      url: row.url,
      author: row.author,
      summary: row.summary,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      feedTitle: row.feedTitle,
      shareUrl: row.url ?? `${req.protocol}://${req.hostname}`,
    };
  });
}
