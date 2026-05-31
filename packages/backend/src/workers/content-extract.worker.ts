import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles } from '../db/schema/index.js';
import { extractArticleContent } from '../lib/content-extractor.js';
import { getLogger } from '../lib/logger.js';
import { getRedisOpts } from '../queues/index.js';

interface ContentExtractJob {
  articleId: string;
  force?: boolean;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Detect "link-only" articles like Hacker News, Lobsters, Reddit RSS where the feed
 * body is just `Article URL: ... Comments URL: ... Points: N`. These need real extraction
 * even though they have non-trivial content length.
 */
export function isThinContent(html: string | null, text: string | null): boolean {
  const t = text ?? '';
  if (t.length < 800) return true;
  if (/Article URL:\s*https?:\/\//i.test(t) && t.length < 2000) return true;
  if (/^Comments URL:/im.test(t) && t.length < 2000) return true;
  // Very short HTML with no paragraphs is probably summary-only
  if (html && html.length < 1000 && !/<p[\s>]/i.test(html)) return true;
  return false;
}

export function createContentExtractWorker() {
  const logger = getLogger();

  const worker = new Worker<ContentExtractJob>(
    'content-extract',
    async (job: Job<ContentExtractJob>) => {
      const { articleId, force } = job.data;
      const db = getDb();

      const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
      if (!article || !article.url) return;
      if (!force && !isThinContent(article.contentHtml, article.contentText)) return;

      logger.info({ articleId, url: article.url }, 'Extracting article content');
      const extracted = await extractArticleContent(article.url);
      if (!extracted || !extracted.content) {
        logger.warn({ articleId, url: article.url }, 'Content extraction returned nothing');
        return;
      }

      const contentText = stripHtml(extracted.content);

      await db.update(articles).set({
        contentHtml: extracted.content,
        contentText,
        wordCount: countWords(contentText),
        imageUrl: extracted.image ?? article.imageUrl,
      }).where(eq(articles.id, articleId));

      logger.info({ articleId, chars: extracted.content.length, words: countWords(contentText) }, 'Content extracted');
    },
    {
      connection: getRedisOpts(),
      concurrency: 3,
      limiter: { max: 5, duration: 1000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Content extract job failed');
  });

  return worker;
}
