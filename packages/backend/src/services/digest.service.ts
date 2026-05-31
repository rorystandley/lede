import { eq, and, sql, desc, gt } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { digests, digestArticles, articles, feeds, userFeedSubscriptions, userArticleStates, folders, users } from '../db/schema/index.js';
import { getLogger } from '../lib/logger.js';
import type { Digest, DigestContent, DigestSection } from '@news-reader/shared';

export class DigestService {
  async buildDigest(userId: string): Promise<Digest> {
    const logger = getLogger();
    const db = getDb();

    const lastDigest = await db
      .select()
      .from(digests)
      .where(eq(digests.userId, userId))
      .orderBy(desc(digests.createdAt))
      .limit(1);

    const since = lastDigest.length > 0 ? lastDigest[0].createdAt : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const unreadArticles = await db
      .select({
        article: articles,
        feedTitle: feeds.title,
        feedFaviconUrl: feeds.faviconUrl,
        folderName: folders.name,
        folderId: userFeedSubscriptions.folderId,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(userFeedSubscriptions, and(
        eq(userFeedSubscriptions.feedId, articles.feedId),
        eq(userFeedSubscriptions.userId, userId),
      ))
      .leftJoin(folders, eq(folders.id, userFeedSubscriptions.folderId))
      .leftJoin(userArticleStates, and(
        eq(userArticleStates.articleId, articles.id),
        eq(userArticleStates.userId, userId),
      ))
      .where(and(
        gt(articles.createdAt, since),
        sql`(${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false)`,
      ))
      .orderBy(desc(articles.publishedAt))
      .limit(200);

    const sectionMap = new Map<string, DigestSection>();

    for (const row of unreadArticles) {
      const folderKey = row.folderName ?? '__ungrouped__';

      if (!sectionMap.has(folderKey)) {
        sectionMap.set(folderKey, {
          folder: row.folderName ?? null,
          feeds: [],
        });
      }

      const section = sectionMap.get(folderKey)!;
      let feedGroup = section.feeds.find((f) => f.feedId === row.article.feedId);
      if (!feedGroup) {
        feedGroup = { feedId: row.article.feedId, feedTitle: row.feedTitle, articles: [] };
        section.feeds.push(feedGroup);
      }

      feedGroup.articles.push({
        id: row.article.id,
        title: row.article.title,
        url: row.article.url,
        feedTitle: row.feedTitle,
        publishedAt: row.article.publishedAt?.toISOString() ?? null,
        summary: row.article.summary ? row.article.summary.slice(0, 300) : null,
        aiSummary: null,
      });
    }

    const totalWords = unreadArticles.reduce((sum, r) => sum + r.article.wordCount, 0);

    const content: DigestContent = {
      date: new Date().toISOString().split('T')[0],
      briefing: null,
      sections: Array.from(sectionMap.values()),
      stats: {
        totalArticles: unreadArticles.length,
        estimatedReadTimeMin: Math.ceil(totalWords / 200),
      },
    };

    const [digest] = await db.insert(digests).values({
      userId,
      scheduledFor: new Date(),
      articleCount: unreadArticles.length,
      status: 'ready',
      contentJson: content,
    }).returning();

    for (let i = 0; i < unreadArticles.length; i++) {
      await db.insert(digestArticles).values({
        digestId: digest.id,
        articleId: unreadArticles[i].article.id,
        sortOrder: i,
      });
    }

    logger.info({ userId, articleCount: unreadArticles.length, digestId: digest.id }, 'Digest built');

    return this.toDigest(digest);
  }

  async getLatest(userId: string): Promise<Digest | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(digests)
      .where(eq(digests.userId, userId))
      .orderBy(desc(digests.createdAt))
      .limit(1);

    return row ? this.toDigest(row) : null;
  }

  async markDelivered(userId: string, digestId: string) {
    const db = getDb();
    await db
      .update(digests)
      .set({ deliveredAt: new Date(), status: 'delivered' })
      .where(and(eq(digests.id, digestId), eq(digests.userId, userId)));
  }

  async listForUser(userId: string, limit = 10): Promise<Digest[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(digests)
      .where(eq(digests.userId, userId))
      .orderBy(desc(digests.createdAt))
      .limit(limit);
    return rows.map((r) => this.toDigest(r));
  }

  async getUsersForDigest(): Promise<{ id: string; timezone: string; digestSchedule: string; email: string; displayName: string | null; digestEmail: boolean; digestPush: boolean }[]> {
    const db = getDb();
    return db
      .select({
        id: users.id,
        timezone: users.timezone,
        digestSchedule: users.digestSchedule,
        email: users.email,
        displayName: users.displayName,
        digestEmail: users.digestEmail,
        digestPush: users.digestPush,
      })
      .from(users)
      .where(eq(users.digestEnabled, true));
  }

  async getUserForDelivery(userId: string): Promise<{ email: string; displayName: string | null; digestEmail: boolean; digestPush: boolean } | null> {
    const db = getDb();
    const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
    if (!user) return null;
    return { email: user.email, displayName: user.displayName, digestEmail: user.digestEmail, digestPush: user.digestPush };
  }

  private toDigest(row: typeof digests.$inferSelect): Digest {
    return {
      id: row.id,
      userId: row.userId,
      scheduledFor: row.scheduledFor.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      articleCount: row.articleCount,
      status: row.status as Digest['status'],
      content: row.contentJson as DigestContent | null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const digestService = new DigestService();
