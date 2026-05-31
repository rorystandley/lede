import { Worker, type Job } from 'bullmq';
import { eq, lt, or, isNull } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { feeds } from '../db/schema/index.js';
import { feedService } from '../services/feed.service.js';
import { getLogger } from '../lib/logger.js';
import { getRedisOpts, getRuleEngineQueue } from '../queues/index.js';
import { feedsRefreshed, articlesIngested, queueJobsProcessed, queueJobDuration } from '../lib/metrics.js';

interface FeedRefreshJob {
  feedId?: string;
}

export function createFeedRefreshWorker() {
  const logger = getLogger();
  const connection = getRedisOpts();

  const worker = new Worker<FeedRefreshJob>(
    'feed-refresh',
    async (job: Job<FeedRefreshJob>) => {
      const jobStart = Date.now();
      if (job.data.feedId) {
        logger.info({ feedId: job.data.feedId }, 'Refreshing single feed');
        try {
          const result = await feedService.refreshFeed(job.data.feedId);
          logger.info({ feedId: job.data.feedId, newArticles: result.newArticles }, 'Feed refreshed');
          feedsRefreshed.inc({ status: 'success' });
          articlesIngested.inc(result.newArticles);
          if (result.newArticleIds.length > 0) {
            const ruleQueue = getRuleEngineQueue();
            for (const articleId of result.newArticleIds) {
              await ruleQueue.add('evaluate', { articleId, feedId: job.data.feedId });
            }
          }
          queueJobsProcessed.inc({ queue: 'feed-refresh', status: 'success' });
          queueJobDuration.observe({ queue: 'feed-refresh' }, (Date.now() - jobStart) / 1000);
          return result;
        } catch (err) {
          feedsRefreshed.inc({ status: 'error' });
          queueJobsProcessed.inc({ queue: 'feed-refresh', status: 'error' });
          throw err;
        }
      }

      const db = getDb();
      const now = new Date();
      const staleFeeds = await db
        .select({ id: feeds.id, refreshInterval: feeds.refreshInterval })
        .from(feeds)
        .where(
          or(
            isNull(feeds.lastFetchedAt),
            lt(
              feeds.lastFetchedAt,
              new Date(now.getTime() - 3600 * 1000),
            ),
          ),
        );

      logger.info({ count: staleFeeds.length }, 'Refreshing stale feeds');

      let totalNew = 0;
      const ruleQueue = getRuleEngineQueue();
      for (const feed of staleFeeds) {
        try {
          const result = await feedService.refreshFeed(feed.id);
          totalNew += result.newArticles;
          feedsRefreshed.inc({ status: 'success' });
          articlesIngested.inc(result.newArticles);
          for (const articleId of result.newArticleIds) {
            await ruleQueue.add('evaluate', { articleId, feedId: feed.id });
          }
        } catch (err) {
          feedsRefreshed.inc({ status: 'error' });
          logger.error({ feedId: feed.id, error: err }, 'Failed to refresh feed');
        }
      }
      queueJobsProcessed.inc({ queue: 'feed-refresh', status: 'success' });
      queueJobDuration.observe({ queue: 'feed-refresh' }, (Date.now() - jobStart) / 1000);

      logger.info({ totalNew }, 'Feed refresh cycle complete');
      return { totalNew };
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Feed refresh job failed');
  });

  return worker;
}
