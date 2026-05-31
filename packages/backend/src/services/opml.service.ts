import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { feeds, userFeedSubscriptions, folders } from '../db/schema/index.js';
import { feedService } from './feed.service.js';
import { folderService } from './folder.service.js';
import { parseOpml, generateOpml } from '../lib/opml-parser.js';
import { getLogger } from '../lib/logger.js';

export class OpmlService {
  async importOpml(userId: string, opmlXml: string): Promise<{ imported: number; failed: number; errors: string[] }> {
    const logger = getLogger();
    const outlines = parseOpml(opmlXml);
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    const processOutline = async (outline: ReturnType<typeof parseOpml>[0], folderId?: string) => {
      if (outline.xmlUrl) {
        try {
          await feedService.subscribe(userId, outline.xmlUrl, folderId, outline.title);
          imported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          if (msg.includes('Already subscribed')) {
            // skip silently
          } else {
            failed++;
            errors.push(`${outline.title}: ${msg}`);
            logger.warn({ url: outline.xmlUrl, error: msg }, 'Failed to import feed');
          }
        }
      } else if (outline.children.length > 0) {
        let childFolderId = folderId;
        try {
          const folder = await folderService.create(userId, outline.title);
          childFolderId = folder.id;
        } catch {
          // folder may already exist
        }
        for (const child of outline.children) {
          await processOutline(child, childFolderId);
        }
      }
    };

    for (const outline of outlines) {
      await processOutline(outline);
    }

    return { imported, failed, errors };
  }

  async exportOpml(userId: string): Promise<string> {
    const db = getDb();

    const subs = await db
      .select({
        feedUrl: feeds.url,
        feedTitle: feeds.title,
        feedSiteUrl: feeds.siteUrl,
        folderName: folders.name,
        customTitle: userFeedSubscriptions.customTitle,
      })
      .from(userFeedSubscriptions)
      .innerJoin(feeds, eq(feeds.id, userFeedSubscriptions.feedId))
      .leftJoin(folders, eq(folders.id, userFeedSubscriptions.folderId))
      .where(eq(userFeedSubscriptions.userId, userId));

    const folderMap = new Map<string, { title: string; xmlUrl: string; htmlUrl?: string }[]>();
    const ungrouped: { title: string; xmlUrl: string; htmlUrl?: string }[] = [];

    for (const sub of subs) {
      const item = {
        title: sub.customTitle ?? sub.feedTitle ?? sub.feedUrl,
        xmlUrl: sub.feedUrl,
        htmlUrl: sub.feedSiteUrl ?? undefined,
      };
      if (sub.folderName) {
        if (!folderMap.has(sub.folderName)) folderMap.set(sub.folderName, []);
        folderMap.get(sub.folderName)!.push(item);
      } else {
        ungrouped.push(item);
      }
    }

    const outlines = [
      ...Array.from(folderMap.entries()).map(([name, items]) => ({
        title: name,
        children: items.map((i) => ({
          title: i.title,
          xmlUrl: i.xmlUrl,
          htmlUrl: i.htmlUrl,
          type: 'rss',
          children: [],
        })),
      })),
      ...ungrouped.map((i) => ({
        title: i.title,
        xmlUrl: i.xmlUrl,
        htmlUrl: i.htmlUrl,
        type: 'rss',
        children: [],
      })),
    ];

    return generateOpml('News Reader Export', outlines);
  }
}

export const opmlService = new OpmlService();
