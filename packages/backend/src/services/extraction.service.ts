import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles } from '../db/schema/index.js';
import { extractArticleContent } from '../lib/content-extractor.js';
import { getLogger } from '../lib/logger.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export class ExtractionService {
  /**
   * Synchronously extract and update an article. Returns the updated article fields,
   * or null if extraction failed.
   */
  async extractNow(articleId: string): Promise<{
    contentHtml: string;
    contentText: string;
    wordCount: number;
    imageUrl: string | null;
  } | null> {
    const logger = getLogger();
    const db = getDb();
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article || !article.url) return null;

    logger.info({ articleId, url: article.url }, 'On-demand extraction');
    const extracted = await extractArticleContent(article.url);
    if (!extracted || !extracted.content) {
      logger.warn({ articleId }, 'Extraction returned nothing');
      return null;
    }

    const contentText = stripHtml(extracted.content);
    const wordCount = countWords(contentText);
    const imageUrl = extracted.image ?? article.imageUrl;

    await db.update(articles).set({
      contentHtml: extracted.content,
      contentText,
      wordCount,
      imageUrl,
    }).where(eq(articles.id, articleId));

    return { contentHtml: extracted.content, contentText, wordCount, imageUrl };
  }
}

export const extractionService = new ExtractionService();
