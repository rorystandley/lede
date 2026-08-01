import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { userFeedSubscriptions } from '../db/schema/index.js';
import { ruleService } from '../services/rule.service.js';
import { getLogger } from '../lib/logger.js';
import { getRedisOpts } from '../queues/index.js';

interface RuleEngineJob {
  articleId: string;
  feedId: string;
}

export function createRuleEngineWorker() {
  const logger = getLogger();

  const worker = new Worker<RuleEngineJob>(
    'rule-engine',
    async (job: Job<RuleEngineJob>) => {
      const { articleId, feedId } = job.data;
      const db = getDb();

      const subscribers = await db
        .select({ userId: userFeedSubscriptions.userId })
        .from(userFeedSubscriptions)
        .where(eq(userFeedSubscriptions.feedId, feedId));

      for (const { userId } of subscribers) {
        try {
          await ruleService.evaluateForArticle(userId, articleId);
        } catch (err) {
          logger.error({ userId, articleId, error: err }, 'Rule evaluation failed');
        }
      }
    },
    {
      connection: getRedisOpts(),
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Rule engine job failed');
  });

  return worker;
}
