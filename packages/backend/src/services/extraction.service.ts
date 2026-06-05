import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles } from '../db/schema/index.js';
import { extractArticleContent } from '../lib/content-extractor.js';
import { fetchPageMetadata } from '../lib/page-metadata.js';
import { getLogger } from '../lib/logger.js';
import { articleHtmlToText, sanitizeArticleHtml, sanitizeArticleImageUrl } from '../lib/html-sanitizer.js';

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
    const extractedContentHtml = sanitizeArticleHtml(extracted?.content);
    if (extractedContentHtml) {
      const contentHtml = extractedContentHtml;
      const contentText = articleHtmlToText(contentHtml);
      const wordCount = countWords(contentText);
      const imageUrl = sanitizeArticleImageUrl(extracted?.image) ?? sanitizeArticleImageUrl(article.imageUrl);

      await db.update(articles).set({
        contentHtml,
        contentText,
        wordCount,
        imageUrl,
      }).where(eq(articles.id, articleId));

      logger.info({ articleId, words: wordCount }, 'Full extraction succeeded');
      return { status: 'full', contentHtml, contentText, wordCount, imageUrl };
    }

    logger.info({ articleId }, 'Full extraction returned nothing — trying metadata fallback');

    // --- Stage 2: og:image / og:description fallback ---
    const metadata = await fetchPageMetadata(article.url);
    const newImage = metadata?.image ?? article.imageUrl ?? null;
    const newDescription = metadata?.description ?? null;
    const gainedSomething = (!article.imageUrl && metadata?.image) || !!newDescription;

    if (metadata && gainedSomething) {
      // Strip any previously prepended metadata block so re-runs don't duplicate.
      const stripExistingMeta = (html: string) =>
        html
          .replace(/<!-- nr:meta -->[\s\S]*?<!-- \/nr:meta -->\s*/g, '')
          .replace(/<aside\s+data-nr-meta=["']true["'][^>]*>[\s\S]*?<\/aside>\s*/gi, '');

      const baseHtml = stripExistingMeta(article.contentHtml ?? '');
      const blocks: string[] = [];
      if (newDescription) {
        blocks.push(`<p><em>${escapeHtml(newDescription)}</em></p>`);
      }

      const synthHtml = blocks.length > 0
        ? `<aside data-nr-meta="true">\n${blocks.join('\n')}\n</aside>\n${baseHtml}`
        : baseHtml;
      const sanitizedSynthHtml = sanitizeArticleHtml(synthHtml);
      const synthText = articleHtmlToText(sanitizedSynthHtml);

      await db.update(articles).set({
        contentHtml: sanitizedSynthHtml || sanitizeArticleHtml(article.contentHtml),
        contentText: synthText || article.contentText,
        wordCount: countWords(synthText),
        imageUrl: sanitizeArticleImageUrl(newImage),
      }).where(eq(articles.id, articleId));

      logger.info({ articleId, hasImage: !!metadata.image, hasDescription: !!newDescription }, 'Metadata fallback succeeded');
      return { status: 'metadata', imageUrl: newImage, description: newDescription, title: metadata.title };
    }

    logger.warn({ articleId, url: article.url }, 'Both extraction stages failed');
    return { status: 'failed' };
  }
}

export const extractionService = new ExtractionService();
