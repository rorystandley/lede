import { Worker, type Job } from 'bullmq';
import { digestService } from '../services/digest.service.js';
import { getLogger } from '../lib/logger.js';
import { getRedisOpts } from '../queues/index.js';
import { sendEmail, isEmailConfigured } from '../lib/email.js';
import { sendPushToUser, isPushConfigured } from '../lib/push.js';
import { renderDigestEmail } from '../lib/digest-email-template.js';
import { getConfig } from '../config.js';
import type { Digest, DigestContent } from '@lede/shared';

interface DigestBuildJob {
  userId?: string;
}

async function deliverDigest(userId: string, digest: Digest) {
  const logger = getLogger();
  const config = getConfig();
  const user = await digestService.getUserForDelivery(userId);
  if (!user || !digest.content) return;
  const content = digest.content as DigestContent;

  if (user.digestEmail && isEmailConfigured()) {
    const { html, text, subject } = renderDigestEmail(content, user.displayName, config.APP_URL);
    const ok = await sendEmail(user.email, subject, html, text);
    if (ok) logger.info({ userId, email: user.email }, 'Digest email sent');
  }

  if (user.digestPush && isPushConfigured()) {
    const sent = await sendPushToUser(userId, {
      title: 'Morning Briefing ready',
      body: `${content.stats.totalArticles} articles · ~${content.stats.estimatedReadTimeMin} min read`,
      url: config.APP_URL,
      tag: 'digest',
    });
    if (sent > 0) logger.info({ userId, sent }, 'Digest push sent');
  }
}

export function createDigestBuildWorker() {
  const logger = getLogger();

  const worker = new Worker<DigestBuildJob>(
    'digest-build',
    async (job: Job<DigestBuildJob>) => {
      if (job.data.userId) {
        logger.info({ userId: job.data.userId }, 'Building digest for user');
        const digest = await digestService.buildDigest(job.data.userId);
        await deliverDigest(job.data.userId, digest);
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
              const digest = await digestService.buildDigest(user.id);
              await deliverDigest(user.id, digest);
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
