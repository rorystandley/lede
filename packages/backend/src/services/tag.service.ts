import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { tags, articleTags } from '../db/schema/index.js';
import { accessControlService, ResourceNotFoundError } from './access-control.service.js';
import type { Tag, TagWithCount, ArticleTagSource } from '@news-reader/shared';

export class TagService {
  async create(userId: string, name: string, color?: string) {
    const db = getDb();
    const [tag] = await db.insert(tags).values({
      userId,
      name,
      color: color ?? null,
    }).returning();
    return this.toTag(tag);
  }

  async update(userId: string, tagId: string, data: { name?: string; color?: string | null }) {
    const db = getDb();
    await accessControlService.assertTagsOwned(userId, [tagId]);

    const [tag] = await db
      .update(tags)
      .set(data)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning();
    if (!tag) throw new ResourceNotFoundError('Tag');
    return this.toTag(tag);
  }

  async delete(userId: string, tagId: string) {
    const db = getDb();
    await accessControlService.assertTagsOwned(userId, [tagId]);

    await db.delete(articleTags).where(and(eq(articleTags.tagId, tagId), eq(articleTags.userId, userId)));
    await db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
  }

  async listForUser(userId: string): Promise<TagWithCount[]> {
    const db = getDb();
    const rows = await db
      .select({
        tag: tags,
        articleCount: sql<number>`(
          SELECT count(*)::int FROM article_tags at2
          WHERE at2.tag_id = ${tags.id}
          AND at2.user_id = ${userId}
        )`,
      })
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(tags.name);

    return rows.map((r) => ({
      ...this.toTag(r.tag),
      articleCount: r.articleCount,
    }));
  }

  async tagArticle(userId: string, articleId: string, tagIds: string[], source: ArticleTagSource = 'manual') {
    const db = getDb();
    await accessControlService.assertArticleAccessible(userId, articleId);
    await accessControlService.assertTagsOwned(userId, tagIds);

    await db.delete(articleTags).where(
      and(eq(articleTags.userId, userId), eq(articleTags.articleId, articleId)),
    );
    if (tagIds.length > 0) {
      await db.insert(articleTags).values(
        tagIds.map((tagId) => ({ userId, articleId, tagId, source })),
      );
    }
  }

  async addTagToArticle(userId: string, articleId: string, tagId: string, source: ArticleTagSource = 'manual') {
    const db = getDb();
    await accessControlService.assertArticleAccessible(userId, articleId);
    await accessControlService.assertTagsOwned(userId, [tagId]);

    await db.insert(articleTags).values({ userId, articleId, tagId, source }).onConflictDoNothing();
  }

  /**
   * Apply tags by name. Creates any tags that don't already exist for the user,
   * then links them to the article. Returns the resolved tag rows.
   */
  async applyTagsByName(userId: string, articleId: string, names: string[], source: ArticleTagSource = 'ai'): Promise<Tag[]> {
    const db = getDb();
    await accessControlService.assertArticleAccessible(userId, articleId);

    const normalised = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean).map((n) => n.toLowerCase())));
    if (normalised.length === 0) return [];

    // Find existing tags for this user matching any of the names
    const existing = await db
      .select()
      .from(tags)
      .where(and(eq(tags.userId, userId)));

    const existingByName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
    const resolved: typeof tags.$inferSelect[] = [];

    for (const name of normalised) {
      const match = existingByName.get(name);
      if (match) {
        resolved.push(match);
        continue;
      }
      const [created] = await db.insert(tags).values({ userId, name }).returning();
      resolved.push(created);
    }

    if (resolved.length > 0) {
      await db.insert(articleTags).values(
        resolved.map((t) => ({ userId, articleId, tagId: t.id, source })),
      ).onConflictDoNothing();
    }

    return resolved.map((t) => this.toTag(t));
  }

  async removeTagFromArticle(userId: string, articleId: string, tagId: string) {
    const db = getDb();
    await accessControlService.assertArticleAccessible(userId, articleId);
    await accessControlService.assertTagsOwned(userId, [tagId]);

    await db.delete(articleTags).where(
      and(eq(articleTags.userId, userId), eq(articleTags.articleId, articleId), eq(articleTags.tagId, tagId)),
    );
  }

  async getArticleTags(userId: string, articleId: string) {
    const db = getDb();
    await accessControlService.assertArticleAccessible(userId, articleId);

    return db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(and(eq(articleTags.userId, userId), eq(articleTags.articleId, articleId)));
  }

  private toTag(row: typeof tags.$inferSelect): Tag {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      color: row.color,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const tagService = new TagService();
