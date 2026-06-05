import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { savedSearches } from '../db/schema/index.js';
import { articleService } from './article.service.js';
import { getLogger } from '../lib/logger.js';
import type { SavedSearch, SearchFilters } from '@news-reader/shared';

export class SavedSearchService {
  async create(userId: string, data: {
    name: string;
    query: string;
    filters?: SearchFilters;
    isMonitor?: boolean;
  }) {
    const db = getDb();
    const [row] = await db.insert(savedSearches).values({
      userId,
      name: data.name,
      query: data.query,
      filters: (data.filters ?? null) as Record<string, unknown> | null,
      isMonitor: data.isMonitor ?? false,
    }).returning();
    return this.toSavedSearch(row);
  }

  async update(userId: string, searchId: string, data: Partial<{
    name: string;
    query: string;
    filters: SearchFilters | null;
    isMonitor: boolean;
  }>) {
    const db = getDb();
    const { filters, ...rest } = data;
    const setData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (filters !== undefined) setData.filters = filters as Record<string, unknown> | null;
    const [row] = await db
      .update(savedSearches)
      .set(setData)
      .where(and(eq(savedSearches.id, searchId), eq(savedSearches.userId, userId)))
      .returning();
    if (!row) throw new Error('Saved search not found');
    return this.toSavedSearch(row);
  }

  async delete(userId: string, searchId: string) {
    const db = getDb();
    await db.delete(savedSearches).where(
      and(eq(savedSearches.id, searchId), eq(savedSearches.userId, userId)),
    );
  }

  async listForUser(userId: string): Promise<SavedSearch[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(savedSearches.name);
    return rows.map((r) => this.toSavedSearch(r));
  }

  async checkMonitors() {
    const logger = getLogger();
    const db = getDb();

    const monitors = await db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.isMonitor, true));

    const results: { searchId: string; userId: string; newCount: number }[] = [];

    for (const monitor of monitors) {
      try {
        const filters = monitor.filters as SearchFilters | null;
        const searchResult = await articleService.search(monitor.userId, {
          q: monitor.query,
          feedId: filters?.feedIds?.[0],
          folderId: filters?.folderIds?.[0],
          tagId: filters?.tagIds?.[0],
          dateFrom: monitor.lastCheckedAt?.toISOString() ?? filters?.dateFrom,
          dateTo: filters?.dateTo,
          page: 1,
          pageSize: 100,
        });

        if (searchResult.items.length > 0) {
          results.push({
            searchId: monitor.id,
            userId: monitor.userId,
            newCount: searchResult.items.length,
          });
        }

        await db.update(savedSearches).set({
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(savedSearches.id, monitor.id));
      } catch (err) {
        logger.error({ err, searchId: monitor.id }, 'Failed to check monitor');
      }
    }

    return results;
  }

  private toSavedSearch(row: typeof savedSearches.$inferSelect): SavedSearch {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      query: row.query,
      filters: row.filters as SearchFilters | null,
      isMonitor: row.isMonitor,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const savedSearchService = new SavedSearchService();
