import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles, feeds } from '../db/schema/index.js';

export default async function sharingRoutes(app: FastifyInstance) {
  // Public share link — no auth required
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
      .where(eq(articles.id, articleId));

    if (!row) return reply.status(404).send({ error: 'Article not found' });

    return {
      title: row.title,
      url: row.url,
      author: row.author,
      summary: row.summary,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      feedTitle: row.feedTitle,
      shareUrl: `${req.protocol}://${req.hostname}/share/article/${articleId}`,
    };
  });
}
