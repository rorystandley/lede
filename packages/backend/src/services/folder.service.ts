import { eq, and, count, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { folders, userFeedSubscriptions, articles, userArticleStates } from '../db/schema/index.js';
import type { Folder, FolderWithCounts } from '@news-reader/shared';

export class FolderService {
  async create(userId: string, name: string, parentId?: string | null) {
    const db = getDb();
    const [folder] = await db.insert(folders).values({
      userId,
      name,
      parentId: parentId ?? null,
    }).returning();
    return this.toFolder(folder);
  }

  async update(userId: string, folderId: string, data: { name?: string; parentId?: string | null; sortOrder?: number }) {
    const db = getDb();
    const [folder] = await db
      .update(folders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .returning();
    if (!folder) throw new Error('Folder not found');
    return this.toFolder(folder);
  }

  async delete(userId: string, folderId: string) {
    const db = getDb();
    await db.update(userFeedSubscriptions)
      .set({ folderId: null })
      .where(and(eq(userFeedSubscriptions.userId, userId), eq(userFeedSubscriptions.folderId, folderId)));
    await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  }

  async listForUser(userId: string): Promise<FolderWithCounts[]> {
    const db = getDb();
    const rows = await db
      .select({
        folder: folders,
        feedCount: sql<number>`(
          SELECT count(*)::int FROM user_feed_subscriptions ufs
          WHERE ufs.folder_id = folders.id AND ufs.user_id = ${userId}
        )`,
        unreadCount: sql<number>`(
          SELECT count(*)::int FROM articles a
          INNER JOIN user_feed_subscriptions ufs ON ufs.feed_id = a.feed_id AND ufs.user_id = ${userId}
          LEFT JOIN user_article_states uas ON uas.article_id = a.id AND uas.user_id = ${userId}
          WHERE ufs.folder_id = folders.id
          AND (uas.is_read IS NULL OR uas.is_read = false)
        )`,
      })
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(folders.sortOrder, folders.name);

    return this.buildTree(rows.map((r) => ({
      ...this.toFolder(r.folder),
      feedCount: r.feedCount,
      unreadCount: r.unreadCount,
      children: [],
    })));
  }

  private buildTree(flat: FolderWithCounts[]): FolderWithCounts[] {
    const map = new Map<string, FolderWithCounts>();
    for (const f of flat) map.set(f.id, f);

    const roots: FolderWithCounts[] = [];
    for (const f of flat) {
      if (f.parentId && map.has(f.parentId)) {
        map.get(f.parentId)!.children.push(f);
      } else {
        roots.push(f);
      }
    }
    return roots;
  }

  private toFolder(row: typeof folders.$inferSelect): Folder {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const folderService = new FolderService();
