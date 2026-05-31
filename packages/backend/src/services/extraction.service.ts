import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles } from '../db/schema/index.js';
import { extractArticleContent } from '../lib/content-extractor.js';
import { fetchPageMetadata } from '../lib/page-metadata.js';
import { getLogger } from '../lib/logger.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type ExtractionResult =
  | { status: 'full'; contentHtml: string; contentText: string; wordCount: number; imageUrl: string | null }
  | { status: 'metadata'; imageUrl: string | null; description: string | null; title: string | null }
  | { status: 'failed' };

export class ExtractionService {
  /**
   * Try Mozilla Readability first. If that returns nothing (SPA / blocked / paywalled),
   * fall back to grabbing og:image / og:description from the page so the article at
   * least gets a hero image and a clearer subtitle even when the body is unreachable.
   */
  async extractNow(articleId: string): Promise<ExtractionResult> {
    const logger = getLogger();
    const db = getDb();
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article || !article.url) return { status: 'failed' };

    logger.info({ articleId, url: article.url }, 'On-demand extraction');

    // --- Stage 1: full readability extraction ---
    const extracted = await extractArticleContent(article.url);
    if (extracted?.content) {
      const contentText = stripHtml(extracted.content);
      const wordCount = countWords(contentText);
      const imageUrl = extracted.image ?? article.imageUrl;

      await db.update(articles).set({
        contentHtml: extracted.content,
        contentText,
        wordCount,
        imageUrl,
      }).where(eq(articles.id, articleId));

      logger.info({ articleId, words: wordCount }, 'Full extraction succeeded');
      return { status: 'full', contentHtml: extracted.content, contentText, wordCount, imageUrl };
    }

    logger.info({ articleId }, 'Full extraction returned nothing — trying metadata fallback');

    // --- Stage 2: og:image / og:description fallback ---
    const metadata = await fetchPageMetadata(article.url);
    const newImage = metadata?.image ?? article.imageUrl ?? null;
    const newDescription = metadata?.description ?? null;
    const gainedSomething = (!article.imageUrl && metadata?.image) || !!newDescription;

    if (metadata && gainedSomething) {
      // Strip any previously prepended metadata block so re-runs don't duplicate.
      const META_MARKER_OPEN = '<!-- nr:meta -->';
      const META_MARKER_CLOSE = '<!-- /nr:meta -->';
      const stripExistingMeta = (html: string) =>
        html.replace(new RegExp(`${META_MARKER_OPEN}[\\s\\S]*?${META_MARKER_CLOSE}\\s*`, 'g'), '');

      const baseHtml = stripExistingMeta(article.contentHtml ?? '');
      const blocks: string[] = [];
      if (newDescription) {
        blocks.push(`<p><em>${escapeHtml(newDescription)}</em></p>`);
      }

      const synthHtml = blocks.length > 0
        ? `${META_MARKER_OPEN}\n${blocks.join('\n')}\n${META_MARKER_CLOSE}\n${baseHtml}`
        : baseHtml;
      const synthText = stripHtml(synthHtml);

      await db.update(articles).set({
        contentHtml: synthHtml || article.contentHtml,
        contentText: synthText || article.contentText,
        wordCount: countWords(synthText),
        imageUrl: newImage,
      }).where(eq(articles.id, articleId));

      logger.info({ articleId, hasImage: !!metadata.image, hasDescription: !!newDescription }, 'Metadata fallback succeeded');
      return { status: 'metadata', imageUrl: newImage, description: newDescription, title: metadata.title };
    }

    logger.warn({ articleId, url: article.url }, 'Both extraction stages failed');
    return { status: 'failed' };
  }
}

export const extractionService = new ExtractionService();
