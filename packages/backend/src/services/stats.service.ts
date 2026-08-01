import { eq, and, sql, desc, count, gte, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { readingStats, userArticleStates, userFeedSubscriptions, articles } from '../db/schema/index.js';

export class StatsService {
  async recordArticleRead(userId: string, _articleId: string, readingTimeMs: number) {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    await db
      .insert(readingStats)
      .values({ userId, date: today, articlesRead: 1, totalTimeMs: readingTimeMs })
      .onConflictDoUpdate({
        target: [readingStats.userId, readingStats.date],
        set: {
          articlesRead: sql`${readingStats.articlesRead} + 1`,
          totalTimeMs: sql`${readingStats.totalTimeMs} + ${readingTimeMs}`,
        },
      });
  }

  async getDailyStats(userId: string, days = 30) {
    const db = getDb();
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split('T')[0];

    return db
      .select()
      .from(readingStats)
      .where(and(eq(readingStats.userId, userId), gte(readingStats.date, sinceStr)))
      .orderBy(desc(readingStats.date));
  }

  async getSummary(userId: string) {
    const db = getDb();

    const [totalRead] = await db
      .select({ count: count() })
      .from(userArticleStates)
      .where(and(eq(userArticleStates.userId, userId), eq(userArticleStates.isRead, true)));

    const [totalStarred] = await db
      .select({ count: count() })
      .from(userArticleStates)
      .where(and(eq(userArticleStates.userId, userId), eq(userArticleStates.isStarred, true)));

    const [totalFeeds] = await db
      .select({ count: count() })
      .from(userFeedSubscriptions)
      .where(eq(userFeedSubscriptions.userId, userId));

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().split('T')[0];

    const weeklyStats = await db
      .select({
        totalArticles: sql<number>`coalesce(sum(${readingStats.articlesRead}), 0)::int`,
        totalTimeMs: sql<number>`coalesce(sum(${readingStats.totalTimeMs}), 0)::int`,
      })
      .from(readingStats)
      .where(and(eq(readingStats.userId, userId), gte(readingStats.date, weekStr)));

    return {
      totalArticlesRead: totalRead.count,
      totalStarred: totalStarred.count,
      totalFeeds: totalFeeds.count,
      weeklyArticlesRead: weeklyStats[0]?.totalArticles ?? 0,
      weeklyReadingTimeMin: Math.round((weeklyStats[0]?.totalTimeMs ?? 0) / 60000),
    };
  }
}

export const statsService = new StatsService();
