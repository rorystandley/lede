import { Worker, type Job } from 'bullmq';
import { digestService } from '../services/digest.service.js';
import { getLogger } from '../lib/logger.js';
import { getRedisOpts } from '../queues/index.js';

interface DigestBuildJob {
  userId?: string;
}

export function createDigestBuildWorker() {
  const logger = getLogger();

  const worker = new Worker<DigestBuildJob>(
    'digest-build',
    async (job: Job<DigestBuildJob>) => {
      if (job.data.userId) {
        logger.info({ userId: job.data.userId }, 'Building digest for user');
        const digest = await digestService.buildDigest(job.data.userId);
        return { digestId: digest.id, articleCount: digest.articleCount };
      }

      const usersToDigest = await digestService.getUsersForDigest();
      const now = new Date();

      for (const user of usersToDigest) {
        try {
          const [hours, minutes] = user.digestSchedule.split(':').map(Number);
          const userNow = new Date(now.toLocaleString('en-US', { timeZone: user.timezone }));
          const currentHour = userNow.getHours();
          const currentMinute = userNow.getMinutes();

          if (currentHour === hours && currentMinute >= minutes && currentMinute < minutes + 5) {
            const existing = await digestService.getLatest(user.id);
            const today = now.toISOString().split('T')[0];

            if (!existing || !existing.createdAt.startsWith(today)) {
              logger.info({ userId: user.id, schedule: user.digestSchedule }, 'Building scheduled digest');
              await digestService.buildDigest(user.id);
            }
          }
        } catch (err) {
          logger.error({ userId: user.id, error: err }, 'Failed to build digest');
        }
      }
    },
    {
      connection: getRedisOpts(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Digest build job failed');
  });

  return worker;
}
