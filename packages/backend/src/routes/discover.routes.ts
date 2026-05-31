import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { FEED_DIRECTORY, FEED_CATEGORIES } from '../lib/feed-directory.js';
import { getDb } from '../db/client.js';
import { userFeedSubscriptions, feeds } from '../db/schema/index.js';
import { parseFeed } from '../lib/feed-parser.js';

export default async function discoverRoutes(app: FastifyInstance) {
  // Public: get the directory (no auth needed for browsing)
  app.get('/directory', {
    schema: { tags: ['Discover'], summary: 'Browse curated feed directory' },
  }, async (req) => {
    const query = z.object({
      category: z.string().optional(),
      q: z.string().optional(),
    }).parse(req.query);

    let results = FEED_DIRECTORY;

    if (query.category) {
      results = results.filter((f) => f.category.toLowerCase() === query.category!.toLowerCase());
    }
    if (query.q) {
      const q = query.q.toLowerCase();
      results = results.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
      );
    }

    return { categories: FEED_CATEGORIES, feeds: results };
  });

  // Authenticated: get directory with subscription status
  app.get('/directory/subscribed', {
    schema: { tags: ['Discover'], summary: 'Browse directory with subscription status' },
    preHandler: [app.authenticate],
  }, async (req) => {
    const db = getDb();
    const query = z.object({
      category: z.string().optional(),
      q: z.string().optional(),
    }).parse(req.query);

    let results = FEED_DIRECTORY;

    if (query.category) {
      results = results.filter((f) => f.category.toLowerCase() === query.category!.toLowerCase());
    }
    if (query.q) {
      const q = query.q.toLowerCase();
      results = results.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
      );
    }

    // Check which feeds the user is already subscribed to
    const userFeeds = await db
      .select({ feedUrl: feeds.url })
      .from(userFeedSubscriptions)
      .innerJoin(feeds, eq(feeds.id, userFeedSubscriptions.feedId))
      .where(eq(userFeedSubscriptions.userId, req.user.id));

    const subscribedUrls = new Set(userFeeds.map((f) => f.feedUrl));

    const feedsWithStatus = results.map((f) => ({
      ...f,
      isSubscribed: subscribedUrls.has(f.url),
    }));

    return { categories: FEED_CATEGORIES, feeds: feedsWithStatus };
  });

  // Detect/validate a feed URL
  app.post('/detect', {
    schema: { tags: ['Discover'], summary: 'Detect and validate a feed URL' },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = z.object({ url: z.string().url() }).parse(req.body);

    try {
      const parsed = await parseFeed(body.url);
      return {
        valid: true,
        title: parsed.title,
        description: parsed.description,
        siteUrl: parsed.siteUrl,
        itemCount: parsed.items.length,
        url: body.url,
      };
    } catch (err) {
      return reply.status(400).send({
        valid: false,
        error: err instanceof Error ? err.message : 'Could not parse feed',
        url: body.url,
      });
    }
  });
}
