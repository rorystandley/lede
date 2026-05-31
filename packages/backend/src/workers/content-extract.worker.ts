import { Worker, type Job } from 'bullmq';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { articles } from '../db/schema/index.js';
import { extractArticleContent } from '../lib/content-extractor.js';
import { getLogger } from '../lib/logger.js';
import { getRedisOpts } from '../queues/index.js';

interface ContentExtractJob {
  articleId: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function createContentExtractWorker() {
  const logger = getLogger();

  const worker = new Worker<ContentExtractJob>(
    'content-extract',
    async (job: Job<ContentExtractJob>) => {
      const { articleId } = job.data;
      const db = getDb();

      const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
      if (!article || !article.url) return;
      if (article.contentHtml && article.contentHtml.length > 500) return;

      const extracted = await extractArticleContent(article.url);
      if (!extracted || !extracted.content) return;

      const contentText = stripHtml(extracted.content);

      await db.update(articles).set({
        contentHtml: extracted.content,
        contentText,
        wordCount: countWords(contentText),
        imageUrl: extracted.image ?? article.imageUrl,
      }).where(eq(articles.id, articleId));

      logger.info({ articleId, chars: extracted.content.length }, 'Content extracted');
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
