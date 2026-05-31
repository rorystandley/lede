import { eq, and, count, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { tags, articleTags } from '../db/schema/index.js';
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
    const [tag] = await db
      .update(tags)
      .set(data)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning();
    if (!tag) throw new Error('Tag not found');
    return this.toTag(tag);
  }

  async delete(userId: string, tagId: string) {
    const db = getDb();
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
    await db.insert(articleTags).values({ userId, articleId, tagId, source }).onConflictDoNothing();
  }

  async removeTagFromArticle(userId: string, articleId: string, tagId: string) {
    const db = getDb();
    await db.delete(articleTags).where(
      and(eq(articleTags.userId, userId), eq(articleTags.articleId, articleId), eq(articleTags.tagId, tagId)),
    );
  }

  async getArticleTags(userId: string, articleId: string) {
    const db = getDb();
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
