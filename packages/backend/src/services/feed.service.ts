import { eq, and, sql, count } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { feeds, userFeedSubscriptions, articles, userArticleStates } from '../db/schema/index.js';
import { parseFeed } from '../lib/feed-parser.js';
import { articleHtmlToText, sanitizeArticleDisplayHtml, sanitizeArticleImageUrl } from '../lib/html-sanitizer.js';
import { accessControlService, ResourceNotFoundError } from './access-control.service.js';
import { getContentExtractQueue, getRuleEngineQueue } from '../queues/index.js';
import type { SubscribedFeed, PaginatedResult, FeedType } from '@lede/shared';

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export class FeedService {
  async subscribe(userId: string, url: string, folderId?: string, customTitle?: string) {
    const db = getDb();

    let [feed] = await db.select().from(feeds).where(eq(feeds.url, url));

    if (!feed) {
      const parsed = await parseFeed(url);
      [feed] = await db.insert(feeds).values({
        url,
        title: parsed.title,
        description: parsed.description,
        siteUrl: parsed.siteUrl,
        feedType: parsed.feedType,
      }).returning();

      if (parsed.items.length > 0) {
        await this.insertArticles(feed.id, parsed.items);
      }
    }

    const existing = await db
      .select()
      .from(userFeedSubscriptions)
      .where(and(
        eq(userFeedSubscriptions.userId, userId),
        eq(userFeedSubscriptions.feedId, feed.id),
      ));

    if (existing.length > 0) {
      throw new Error('Already subscribed to this feed');
    }

    const [sub] = await db.insert(userFeedSubscriptions).values({
      userId,
      feedId: feed.id,
      folderId: folderId ?? null,
      customTitle: customTitle ?? null,
    }).returning();

    return { feed, subscription: sub };
  }

  async updateSubscription(userId: string, feedId: string, data: { folderId?: string | null; customTitle?: string | null; notify?: boolean; refreshInterval?: number }) {
    const db = getDb();
    await accessControlService.assertFeedSubscribed(userId, feedId);

    const updateData: Record<string, unknown> = {};
    if (data.folderId !== undefined) updateData.folderId = data.folderId;
    if (data.customTitle !== undefined) updateData.customTitle = data.customTitle;
    if (data.notify !== undefined) updateData.notify = data.notify ? 1 : 0;

    if (Object.keys(updateData).length > 0) {
      await db
        .update(userFeedSubscriptions)
        .set(updateData)
        .where(and(
          eq(userFeedSubscriptions.userId, userId),
          eq(userFeedSubscriptions.feedId, feedId),
        ));
    }

    if (data.refreshInterval !== undefined) {
      await db
        .update(feeds)
        .set({ refreshInterval: data.refreshInterval, updatedAt: new Date() })
        .where(eq(feeds.id, feedId));
    }
  }

  async unsubscribe(userId: string, feedId: string) {
    const db = getDb();
    await accessControlService.assertFeedSubscribed(userId, feedId);

    await db
      .delete(userFeedSubscriptions)
      .where(and(
        eq(userFeedSubscriptions.userId, userId),
        eq(userFeedSubscriptions.feedId, feedId),
      ));
  }

  async listForUser(userId: string, opts: { folderId?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<SubscribedFeed>> {
    const db = getDb();
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(userFeedSubscriptions.userId, userId)];
    if (opts.folderId) {
      conditions.push(eq(userFeedSubscriptions.folderId, opts.folderId));
    }

    const rows = await db
      .select({
        feed: feeds,
        subscription: userFeedSubscriptions,
        unreadCount: sql<number>`(
          SELECT count(*)::int FROM articles a
          LEFT JOIN user_article_states uas ON uas.article_id = a.id AND uas.user_id = ${userId}
          WHERE a.feed_id = ${feeds.id}
          AND (uas.is_read IS NULL OR uas.is_read = false)
        )`,
      })
      .from(userFeedSubscriptions)
      .innerJoin(feeds, eq(feeds.id, userFeedSubscriptions.feedId))
      .where(and(...conditions))
      .orderBy(feeds.title)
      .limit(pageSize)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(userFeedSubscriptions)
      .where(and(...conditions));

    const items: SubscribedFeed[] = rows.map((r) => ({
      ...r.feed,
      feedType: r.feed.feedType as FeedType,
      createdAt: r.feed.createdAt.toISOString(),
      updatedAt: r.feed.updatedAt.toISOString(),
      lastFetchedAt: r.feed.lastFetchedAt?.toISOString() ?? null,
      subscriptionId: r.subscription.id,
      folderId: r.subscription.folderId,
      customTitle: r.subscription.customTitle,
      notify: r.subscription.notify === 1,
      unreadCount: r.unreadCount,
    }));

    return { items, total, page, pageSize, hasMore: offset + pageSize < total };
  }

  async listSubscribedFeedIds(userId: string): Promise<string[]> {
    return accessControlService.listSubscribedFeedIds(userId);
  }

  async refreshFeed(feedId: string, opts: { userId?: string } = {}): Promise<{ newArticles: number; newArticleIds: string[] }> {
    const db = getDb();
    if (opts.userId) {
      await accessControlService.assertFeedSubscribed(opts.userId, feedId);
    }

    const [feed] = await db.select().from(feeds).where(eq(feeds.id, feedId));
    if (!feed) throw new ResourceNotFoundError('Feed');

    try {
      const parsed = await parseFeed(feed.url);
      const newArticleIds = await this.insertArticles(feed.id, parsed.items);

      await db.update(feeds).set({
        title: parsed.title ?? feed.title,
        description: parsed.description ?? feed.description,
        siteUrl: parsed.siteUrl ?? feed.siteUrl,
        feedType: parsed.feedType,
        lastFetchedAt: new Date(),
        lastError: null,
        errorCount: 0,
        updatedAt: new Date(),
      }).where(eq(feeds.id, feedId));

      return { newArticles: newArticleIds.length, newArticleIds };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await db.update(feeds).set({
        lastError: message,
        errorCount: feed.errorCount + 1,
        updatedAt: new Date(),
      }).where(eq(feeds.id, feedId));
      throw err;
    }
  }

  private async insertArticles(feedId: string, items: Awaited<ReturnType<typeof parseFeed>>['items']): Promise<string[]> {
    const db = getDb();
    const insertedIds: string[] = [];

    for (const item of items) {
      const contentHtml = sanitizeArticleDisplayHtml(item.contentHtml, item.summary);
      const contentText = contentHtml ? articleHtmlToText(contentHtml) : (item.summary ?? '');
      const wordCount = countWords(contentText);

      try {
        const result = await db.insert(articles).values({
          feedId,
          guid: item.guid,
          url: item.url,
          title: item.title,
          author: item.author,
          summary: item.summary,
          contentHtml,
          contentText: contentText || null,
          imageUrl: sanitizeArticleImageUrl(item.imageUrl),
          publishedAt: item.publishedAt,
          wordCount,
        }).onConflictDoNothing().returning({ id: articles.id });
        if (result.length > 0) insertedIds.push(result[0].id);
      } catch {
        // duplicate guid — skip
      }
    }

    if (insertedIds.length > 0) {
      const extractQueue = getContentExtractQueue();
      const ruleQueue = getRuleEngineQueue();
      for (const articleId of insertedIds) {
        await extractQueue.add('extract', { articleId });
        await ruleQueue.add('evaluate', { articleId, feedId });
      }
    }

    return insertedIds;
  }
}

export const feedService = new FeedService();
