import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { annotations, articles, tags, userFeedSubscriptions } from '../db/schema/index.js';

export class ResourceNotFoundError extends Error {
  statusCode = 404;

  constructor(resource: 'Article' | 'Feed' | 'Tag' | 'Annotation' | 'Resource' = 'Resource') {
    super(`${resource} not found`);
    this.name = 'ResourceNotFoundError';
  }
}

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export class AccessControlService {
  async listSubscribedFeedIds(userId: string): Promise<string[]> {
    const db = getDb();
    const rows = await db
      .select({ feedId: userFeedSubscriptions.feedId })
      .from(userFeedSubscriptions)
      .where(eq(userFeedSubscriptions.userId, userId));

    return rows.map((row) => row.feedId);
  }

  async assertFeedSubscribed(userId: string, feedId: string): Promise<void> {
    const db = getDb();
    const [row] = await db
      .select({ id: userFeedSubscriptions.id })
      .from(userFeedSubscriptions)
      .where(and(
        eq(userFeedSubscriptions.userId, userId),
        eq(userFeedSubscriptions.feedId, feedId),
      ))
      .limit(1);

    if (!row) throw new ResourceNotFoundError('Feed');
  }

  async getAccessibleArticle(userId: string, articleId: string): Promise<typeof articles.$inferSelect | null> {
    const db = getDb();
    const [row] = await db
      .select({ article: articles })
      .from(articles)
      .innerJoin(
        userFeedSubscriptions,
        and(
          eq(userFeedSubscriptions.feedId, articles.feedId),
          eq(userFeedSubscriptions.userId, userId),
        ),
      )
      .where(eq(articles.id, articleId))
      .limit(1);

    return row?.article ?? null;
  }

  async assertArticleAccessible(userId: string, articleId: string): Promise<void> {
    const article = await this.getAccessibleArticle(userId, articleId);
    if (!article) throw new ResourceNotFoundError('Article');
  }

  async getAccessibleArticleIds(userId: string, articleIds: string[]): Promise<string[]> {
    const ids = unique(articleIds);
    if (ids.length === 0) return [];

    const db = getDb();
    const rows = await db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(
        userFeedSubscriptions,
        and(
          eq(userFeedSubscriptions.feedId, articles.feedId),
          eq(userFeedSubscriptions.userId, userId),
        ),
      )
      .where(inArray(articles.id, ids));

    return rows.map((row) => row.id);
  }

  async assertArticlesAccessible(userId: string, articleIds: string[]): Promise<string[]> {
    const ids = unique(articleIds);
    const accessibleIds = await this.getAccessibleArticleIds(userId, ids);
    if (accessibleIds.length !== ids.length) throw new ResourceNotFoundError('Article');
    return ids;
  }

  async assertTagsOwned(userId: string, tagIds: string[]): Promise<void> {
    const ids = unique(tagIds);
    if (ids.length === 0) return;

    const db = getDb();
    const rows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, ids)));

    if (rows.length !== ids.length) throw new ResourceNotFoundError('Tag');
  }

  async assertAnnotationAccessible(userId: string, annotationId: string): Promise<void> {
    const db = getDb();
    const [row] = await db
      .select({ id: annotations.id })
      .from(annotations)
      .innerJoin(articles, eq(articles.id, annotations.articleId))
      .innerJoin(
        userFeedSubscriptions,
        and(
          eq(userFeedSubscriptions.feedId, articles.feedId),
          eq(userFeedSubscriptions.userId, userId),
        ),
      )
      .where(and(eq(annotations.id, annotationId), eq(annotations.userId, userId)))
      .limit(1);

    if (!row) throw new ResourceNotFoundError('Annotation');
  }
}

export const accessControlService = new AccessControlService();
