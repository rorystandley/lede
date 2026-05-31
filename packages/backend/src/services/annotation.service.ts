import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { annotations } from '../db/schema/index.js';

export class AnnotationService {
  async create(userId: string, articleId: string, data: {
    type: 'highlight' | 'note';
    content?: string;
    startOffset?: number;
    endOffset?: number;
    color?: string;
  }) {
    const db = getDb();
    const [annotation] = await db.insert(annotations).values({
      userId,
      articleId,
      type: data.type,
      content: data.content ?? null,
      startOffset: data.startOffset ?? null,
      endOffset: data.endOffset ?? null,
      color: data.color ?? null,
    }).returning();
    return annotation;
  }

  async listForArticle(userId: string, articleId: string) {
    const db = getDb();
    return db
      .select()
      .from(annotations)
      .where(and(eq(annotations.userId, userId), eq(annotations.articleId, articleId)))
      .orderBy(annotations.startOffset);
  }

  async delete(userId: string, annotationId: string) {
    const db = getDb();
    await db.delete(annotations).where(
      and(eq(annotations.id, annotationId), eq(annotations.userId, userId)),
    );
  }

  async update(userId: string, annotationId: string, data: { content?: string; color?: string }) {
    const db = getDb();
    const [updated] = await db
      .update(annotations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(annotations.id, annotationId), eq(annotations.userId, userId)))
      .returning();
    return updated;
  }
}

export const annotationService = new AnnotationService();
