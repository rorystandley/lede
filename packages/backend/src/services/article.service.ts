import { eq, and, sql, count, inArray, type SQL } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles, userArticleStates, feeds, userFeedSubscriptions, articleTags, tags } from '../db/schema/index.js';
import { sanitizeArticleDisplayHtml, sanitizeArticleImageUrl } from '../lib/html-sanitizer.js';
import { decodeHtmlEntities } from '../lib/html-entities.js';
import { accessControlService } from './access-control.service.js';
import type { ArticleWithState, PaginatedResult, ListArticlesQuery, SearchArticlesQuery } from '@lede/shared';

/**
 * Identity key used to collapse duplicate articles. The same story is often
 * carried by more than one subscribed feed (e.g. a site's main feed plus a
 * category feed, or syndicated content), each stored as its own row with its
 * own (feed_id, guid). Those share a canonical article URL, so we key on a
 * normalised URL — lowercased, with the fragment and trailing slashes stripped
 * — and fall back to the title, then the guid, when no URL is present.
 */
const articleDedupeKey = sql`lower(coalesce(
  nullif(regexp_replace(regexp_replace(btrim(${articles.url}), '#.*$', ''), '/+$', ''), ''),
  btrim(${articles.title}),
  ${articles.guid}
))`;

type DedupeScope = { feedId?: string; folderId?: string };

function decodeArticleMetadata<
  T extends { title?: string | null; author?: string | null; summary?: string | null },
>(article: T): T {
  return {
    ...article,
    ...(article.title !== undefined ? { title: decodeHtmlEntities(article.title) } : {}),
    ...(article.author !== undefined ? { author: decodeHtmlEntities(article.author) } : {}),
    ...(article.summary !== undefined ? { summary: decodeHtmlEntities(article.summary) } : {}),
  } as T;
}

export class ArticleService {
  /**
   * Subquery selecting one representative article id per dedupe key, so callers
   * can filter a listing down to a single copy of each story via
   * `inArray(articles.id, ...)`. The representative is the most recently
   * published copy (then lowest id) within the given view scope, chosen
   * independently of read/star state so the choice is stable across requests.
   */
  private representativeArticleIds(db: ReturnType<typeof getDb>, userId: string, scope: DedupeScope) {
    const scopeConditions: SQL[] = [];
    if (scope.feedId) scopeConditions.push(eq(articles.feedId, scope.feedId));
    if (scope.folderId) scopeConditions.push(eq(userFeedSubscriptions.folderId, scope.folderId));

    return db
      .selectDistinctOn([articleDedupeKey], { id: articles.id })
      .from(articles)
      .innerJoin(
        userFeedSubscriptions,
        and(
          eq(userFeedSubscriptions.feedId, articles.feedId),
          eq(userFeedSubscriptions.userId, userId),
        ),
      )
      .where(scopeConditions.length > 0 ? and(...scopeConditions) : undefined)
      .orderBy(articleDedupeKey, sql`${articles.publishedAt} desc nulls last`, articles.id);
  }

  private listConditions(db: ReturnType<typeof getDb>, userId: string, query: ListArticlesQuery): SQL[] {
    // Keep only one copy of each story, scoped to the same feeds the listing shows.
    const conditions: SQL[] = [
      inArray(articles.id, this.representativeArticleIds(db, userId, { feedId: query.feedId, folderId: query.folderId })),
    ];

    if (query.feedId) {
      conditions.push(eq(articles.feedId, query.feedId));
    }
    if (query.folderId) {
      const folderFeeds = db
        .select({ feedId: userFeedSubscriptions.feedId })
        .from(userFeedSubscriptions)
        .where(and(
          eq(userFeedSubscriptions.userId, userId),
          eq(userFeedSubscriptions.folderId, query.folderId),
        ));
      conditions.push(inArray(articles.feedId, folderFeeds));
    }
    if (query.isRead !== undefined) {
      conditions.push(
        query.isRead
          ? eq(userArticleStates.isRead, true)
          : sql`(${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false)`,
      );
    }
    if (query.isStarred !== undefined) {
      conditions.push(eq(userArticleStates.isStarred, query.isStarred));
    }

    return conditions;
  }

  async list(userId: string, query: ListArticlesQuery): Promise<PaginatedResult<ArticleWithState>> {
    const db = getDb();
    const { page, pageSize, sort, order } = query;
    const offset = (page - 1) * pageSize;

    // All filters (duplicate-collapsing + feed/folder/read/starred) are combined
    // into a single `where`: Drizzle's `.where()` replaces rather than ANDs, so
    // they must be assembled together. The same set drives the count query below.
    const conditions = this.listConditions(db, userId, query);

    // Sort newest-first across all feeds (a chronological "river"). Force NULLS
    // LAST so articles lacking a publishedAt don't clump at the very top under
    // Postgres' default NULLS FIRST for DESC, and break ties on id so the order
    // is deterministic — matching the dedupe representative query above.
    const orderCol = sort === 'created_at' ? articles.createdAt : articles.publishedAt;
    const orderExpr = order === 'asc'
      ? sql`${orderCol} asc nulls last`
      : sql`${orderCol} desc nulls last`;

    const rows = await db
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
      .where(and(...conditions))
      .orderBy(orderExpr, articles.id)
      .limit(pageSize)
      .offset(offset);

    const items: ArticleWithState[] = rows.map((r) => ({
      ...decodeArticleMetadata(r.article),
      contentHtml: sanitizeArticleDisplayHtml(r.article.contentHtml, r.article.summary),
      imageUrl: sanitizeArticleImageUrl(r.article.imageUrl),
      createdAt: r.article.createdAt.toISOString(),
      publishedAt: r.article.publishedAt?.toISOString() ?? null,
      feedTitle: decodeHtmlEntities(r.feedTitle),
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
      const [{ count: totalCount }] = await db
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
        .where(and(...conditions));
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
      ...decodeArticleMetadata(row.article),
      contentHtml: sanitizeArticleDisplayHtml(row.article.contentHtml, row.article.summary),
      imageUrl: sanitizeArticleImageUrl(row.article.imageUrl),
      createdAt: row.article.createdAt.toISOString(),
      publishedAt: row.article.publishedAt?.toISOString() ?? null,
      feedTitle: decodeHtmlEntities(row.feedTitle),
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

    // Collect every condition and apply it in a single .where(). Drizzle's
    // .where() replaces the existing clause rather than ANDing onto it, so
    // calling it conditionally would drop earlier conditions.
    const conditions: SQL[] = [
      inArray(articles.feedId, subscribedFeeds),
      sql`(${userArticleStates.isRead} IS NULL OR ${userArticleStates.isRead} = false)`,
    ];

    if (scope.feedId) {
      conditions.push(eq(articles.feedId, scope.feedId));
    }
    if (scope.folderId) {
      const folderFeeds = db
        .select({ feedId: userFeedSubscriptions.feedId })
        .from(userFeedSubscriptions)
        .where(and(eq(userFeedSubscriptions.userId, userId), eq(userFeedSubscriptions.folderId, scope.folderId)));
      conditions.push(inArray(articles.feedId, folderFeeds));
    }

    const rows = await db
      .select({ id: articles.id })
      .from(articles)
      .leftJoin(userArticleStates, and(
        eq(userArticleStates.articleId, articles.id),
        eq(userArticleStates.userId, userId),
      ))
      .where(and(...conditions))
      .limit(10_000);
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
        inArray(articles.id, this.representativeArticleIds(db, userId, {})),
        sql`to_tsvector('english', coalesce(${articles.title}, '') || ' ' || coalesce(${articles.contentText}, '')) @@ to_tsquery('english', ${tsQuery})`,
      ))
      .orderBy(sql`search_rank DESC`)
      .limit(pageSize)
      .offset(offset);

    const items: ArticleWithState[] = rows.map((r) => ({
      ...decodeArticleMetadata(r.article),
      contentHtml: sanitizeArticleDisplayHtml(r.article.contentHtml, r.article.summary),
      imageUrl: sanitizeArticleImageUrl(r.article.imageUrl),
      createdAt: r.article.createdAt.toISOString(),
      publishedAt: r.article.publishedAt?.toISOString() ?? null,
      feedTitle: decodeHtmlEntities(r.feedTitle),
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
