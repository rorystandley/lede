import { eq, and, desc, asc, sql, count, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles, userArticleStates, feeds, userFeedSubscriptions, articleTags, tags } from '../db/schema/index.js';
import { sanitizeArticleDisplayHtml, sanitizeArticleImageUrl } from '../lib/html-sanitizer.js';
import { accessControlService } from './access-control.service.js';
import type { ArticleWithState, PaginatedResult, ListArticlesQuery, SearchArticlesQuery } from '@lede/shared';

export class ArticleService {
  async list(userId: string, query: ListArticlesQuery): Promise<PaginatedResult<ArticleWithState>> {
    const db = getDb();
    const { page, pageSize, sort, order } = query;
    const offset = (page - 1) * pageSize;

    let baseQuery = db
      .select({
        article: articles,
        feedTitle: feeds.title,
        feedFaviconUrl: feeds.faviconUrl,
        isRead: sql<boolean>`coalesce(${userArticleStates.isRead}, false)`,
        isStarred: sql<boolean>`coalesce(${userArticleStates.isStarred}, false)`,
        isArchived: sql<boolean>`coalesce(${userArticleStates.isArchived}, false)`,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        userFeedSubscriptions,
        and(
          eq(userFeedSubscriptions.feedId, articles.feedId),
          eq(userFeedSubscriptions.userId, userId),
        ),
      )
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, userId),
        ),
      )
      .$dynamic();

    if (query.feedId) {
      baseQuery = baseQuery.where(eq(articles.feedId, query.feedId));
    }
    if (query.folderId) {
      const folderFeeds = db
        .select({ feedId: userFeedSubscriptions.feedId })
        .from(userFeedSubscriptions)
        .where(and(
          eq(userFeedSubscriptions.userId, userId),
          eq(userFeedSubscriptions.folderId, query.folderId),
        ));
      baseQuery = baseQuery.where(inArray(articles.feedId, folderFeeds));
    }
    if (query.isRead !== undefined) {
      baseQuery = baseQuery.where(
        query.isRead
          ? eq(userArticleStates.isRead, true)
          : sql`(${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false)`,
      );
    }
    if (query.isStarred !== undefined) {
      baseQuery = baseQuery.where(eq(userArticleStates.isStarred, query.isStarred));
    }

    const orderCol = sort === 'created_at' ? articles.createdAt : articles.publishedAt;
    const orderFn = order === 'asc' ? asc : desc;

    const rows = await baseQuery
      .orderBy(orderFn(orderCol))
      .limit(pageSize)
      .offset(offset);

    const items: ArticleWithState[] = rows.map((r) => ({
      ...r.article,
      contentHtml: sanitizeArticleDisplayHtml(r.article.contentHtml, r.article.summary),
      imageUrl: sanitizeArticleImageUrl(r.article.imageUrl),
      createdAt: r.article.createdAt.toISOString(),
      publishedAt: r.article.publishedAt?.toISOString() ?? null,
      feedTitle: r.feedTitle,
      feedFaviconUrl: r.feedFaviconUrl,
      isRead: r.isRead,
      isStarred: r.isStarred,
      isArchived: r.isArchived,
      tags: [],
    }));

    let total: number;
    if (rows.length < pageSize && page === 1) {
      total = rows.length;
    } else {
      let countQuery = db
        .select({ count: count() })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          userFeedSubscriptions,
          and(
            eq(userFeedSubscriptions.feedId, articles.feedId),
            eq(userFeedSubscriptions.userId, userId),
          ),
        )
        .leftJoin(
          userArticleStates,
          and(
            eq(userArticleStates.articleId, articles.id),
            eq(userArticleStates.userId, userId),
          ),
        )
        .$dynamic();

      if (query.feedId) {
        countQuery = countQuery.where(eq(articles.feedId, query.feedId));
      }
      if (query.folderId) {
        const folderFeeds = db
          .select({ feedId: userFeedSubscriptions.feedId })
          .from(userFeedSubscriptions)
          .where(and(
            eq(userFeedSubscriptions.userId, userId),
            eq(userFeedSubscriptions.folderId, query.folderId),
          ));
        countQuery = countQuery.where(inArray(articles.feedId, folderFeeds));
      }
      if (query.isRead !== undefined) {
        countQuery = countQuery.where(
          query.isRead
            ? eq(userArticleStates.isRead, true)
            : sql`(${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false)`,
        );
      }
      if (query.isStarred !== undefined) {
        countQuery = countQuery.where(eq(userArticleStates.isStarred, query.isStarred));
      }

      const [{ count: totalCount }] = await countQuery;
      total = totalCount;
    }

    return { items, total, page, pageSize, hasMore: rows.length === pageSize };
  }

  async getById(userId: string, articleId: string): Promise<ArticleWithState | null> {
    const db = getDb();

    const [row] = await db
      .select({
        article: articles,
        feedTitle: feeds.title,
        feedFaviconUrl: feeds.faviconUrl,
        isRead: sql<boolean>`coalesce(${userArticleStates.isRead}, false)`,
        isStarred: sql<boolean>`coalesce(${userArticleStates.isStarred}, false)`,
        isArchived: sql<boolean>`coalesce(${userArticleStates.isArchived}, false)`,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        userFeedSubscriptions,
        and(
          eq(userFeedSubscriptions.feedId, articles.feedId),
          eq(userFeedSubscriptions.userId, userId),
        ),
      )
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, userId),
        ),
      )
      .where(eq(articles.id, articleId));

    if (!row) return null;

    const tagRows = await db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(and(eq(articleTags.articleId, articleId), eq(articleTags.userId, userId)));

    return {
      ...row.article,
      contentHtml: sanitizeArticleDisplayHtml(row.article.contentHtml, row.article.summary),
      imageUrl: sanitizeArticleImageUrl(row.article.imageUrl),
      createdAt: row.article.createdAt.toISOString(),
      publishedAt: row.article.publishedAt?.toISOString() ?? null,
      feedTitle: row.feedTitle,
      feedFaviconUrl: row.feedFaviconUrl,
      isRead: row.isRead,
      isStarred: row.isStarred,
      isArchived: row.isArchived,
      tags: tagRows,
    };
  }

  async markRead(userId: string, articleIds: string[]) {
    const db = getDb();
    const accessibleArticleIds = await accessControlService.assertArticlesAccessible(userId, articleIds);
    const now = new Date();

    for (const articleId of accessibleArticleIds) {
      await db
        .insert(userArticleStates)
        .values({ userId, articleId, isRead: true, readAt: now })
        .onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.articleId],
          set: { isRead: true, readAt: now, updatedAt: now },
        });
    }
  }

  async markAllRead(userId: string, scope: { feedId?: string; folderId?: string; tagId?: string }): Promise<number> {
    const db = getDb();
    if (scope.feedId) {
      await accessControlService.assertFeedSubscribed(userId, scope.feedId);
    }

    // Find unread article IDs in scope
    const subscribedFeeds = db
      .select({ feedId: userFeedSubscriptions.feedId })
      .from(userFeedSubscriptions)
      .where(eq(userFeedSubscriptions.userId, userId));

    let articleQuery = db
      .select({ id: articles.id })
      .from(articles)
      .leftJoin(userArticleStates, and(
        eq(userArticleStates.articleId, articles.id),
        eq(userArticleStates.userId, userId),
      ))
      .where(and(
        inArray(articles.feedId, subscribedFeeds),
        sql`(${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false)`,
      ))
      .$dynamic();

    if (scope.feedId) {
      articleQuery = articleQuery.where(eq(articles.feedId, scope.feedId));
    }
    if (scope.folderId) {
      const folderFeeds = db
        .select({ feedId: userFeedSubscriptions.feedId })
        .from(userFeedSubscriptions)
        .where(and(eq(userFeedSubscriptions.userId, userId), eq(userFeedSubscriptions.folderId, scope.folderId)));
      articleQuery = articleQuery.where(inArray(articles.feedId, folderFeeds));
    }

    const rows = await articleQuery.limit(10_000);
    if (rows.length === 0) return 0;

    await this.markRead(userId, rows.map((r) => r.id));
    return rows.length;
  }

  async markUnread(userId: string, articleIds: string[]) {
    const db = getDb();
    const accessibleArticleIds = await accessControlService.assertArticlesAccessible(userId, articleIds);
    const now = new Date();

    for (const articleId of accessibleArticleIds) {
      await db
        .insert(userArticleStates)
        .values({ userId, articleId, isRead: false })
        .onConflictDoUpdate({
          target: [userArticleStates.userId, userArticleStates.articleId],
          set: { isRead: false, readAt: null, updatedAt: now },
        });
    }
  }

  async setStar(userId: string, articleId: string, isStarred: boolean) {
    const db = getDb();
    await accessControlService.assertArticleAccessible(userId, articleId);

    await db
      .insert(userArticleStates)
      .values({ userId, articleId, isStarred })
      .onConflictDoUpdate({
        target: [userArticleStates.userId, userArticleStates.articleId],
        set: { isStarred, updatedAt: new Date() },
      });
  }

  async setArchived(userId: string, articleId: string, isArchived: boolean) {
    const db = getDb();
    await accessControlService.assertArticleAccessible(userId, articleId);

    await db
      .insert(userArticleStates)
      .values({ userId, articleId, isArchived })
      .onConflictDoUpdate({
        target: [userArticleStates.userId, userArticleStates.articleId],
        set: { isArchived, updatedAt: new Date() },
      });
  }

  async search(userId: string, query: SearchArticlesQuery): Promise<PaginatedResult<ArticleWithState>> {
    const db = getDb();
    const { q, page, pageSize } = query;
    const offset = (page - 1) * pageSize;

    const subscribedFeeds = db
      .select({ feedId: userFeedSubscriptions.feedId })
      .from(userFeedSubscriptions)
      .where(eq(userFeedSubscriptions.userId, userId));

    // Sanitize input: strip tsquery-special characters, keep only words
    const words = q.split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9À-ɏ]/g, ''))
      .filter((w) => w.length > 0);

    if (words.length === 0) {
      return { items: [], total: 0, page, pageSize, hasMore: false };
    }

    const tsQuery = words.map((w) => `${w}:*`).join(' & ');

    const rows = await db
      .select({
        article: articles,
        feedTitle: feeds.title,
        feedFaviconUrl: feeds.faviconUrl,
        isRead: sql<boolean>`coalesce(${userArticleStates.isRead}, false)`,
        isStarred: sql<boolean>`coalesce(${userArticleStates.isStarred}, false)`,
        isArchived: sql<boolean>`coalesce(${userArticleStates.isArchived}, false)`,
        rank: sql<number>`ts_rank(to_tsvector('english', coalesce(${articles.title}, '') || ' ' || coalesce(${articles.contentText}, '')), to_tsquery('english', ${tsQuery}))`.as('search_rank'),
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .leftJoin(
        userArticleStates,
        and(
          eq(userArticleStates.articleId, articles.id),
          eq(userArticleStates.userId, userId),
        ),
      )
      .where(and(
        inArray(articles.feedId, subscribedFeeds),
        sql`to_tsvector('english', coalesce(${articles.title}, '') || ' ' || coalesce(${articles.contentText}, '')) @@ to_tsquery('english', ${tsQuery})`,
      ))
      .orderBy(sql`search_rank DESC`)
      .limit(pageSize)
      .offset(offset);

    const items: ArticleWithState[] = rows.map((r) => ({
      ...r.article,
      contentHtml: sanitizeArticleDisplayHtml(r.article.contentHtml, r.article.summary),
      imageUrl: sanitizeArticleImageUrl(r.article.imageUrl),
      createdAt: r.article.createdAt.toISOString(),
      publishedAt: r.article.publishedAt?.toISOString() ?? null,
      feedTitle: r.feedTitle,
      feedFaviconUrl: r.feedFaviconUrl,
      isRead: r.isRead,
      isStarred: r.isStarred,
      isArchived: r.isArchived,
      tags: [],
    }));

    return { items, total: items.length, page, pageSize, hasMore: rows.length === pageSize };
  }
}

export const articleService = new ArticleService();
