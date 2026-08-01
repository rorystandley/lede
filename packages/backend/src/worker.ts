import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import { loadConfig, getConfig } from './config.js';
import { setupRecurringJobs, closeQueues } from './queues/index.js';
import { createFeedRefreshWorker } from './workers/feed-refresh.worker.js';
import { createRuleEngineWorker } from './workers/rule-engine.worker.js';
import { createDigestBuildWorker } from './workers/digest-build.worker.js';
import { createContentExtractWorker } from './workers/content-extract.worker.js';
import { closeDb } from './db/client.js';
import { getLogger } from './lib/logger.js';
import { initSentry } from './lib/sentry.js';
import { initPush } from './lib/push.js';

loadConfig();
const config = getConfig();
initSentry();
initPush();

const logger = getLogger();
logger.info({ role: 'worker' }, 'Starting worker process');

const feedRefreshWorker = createFeedRefreshWorker();
const ruleEngineWorker = createRuleEngineWorker();
const digestBuildWorker = createDigestBuildWorker();
const contentExtractWorker = createContentExtractWorker();
await setupRecurringJobs();

logger.info('Workers running: feed-refresh, rule-engine, digest-build, content-extract');

async function shutdown() {
  logger.info('Shutting down workers...');
  await feedRefreshWorker.close();
  await ruleEngineWorker.close();
  await digestBuildWorker.close();
  await contentExtractWorker.close();
  await closeQueues();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep alive
setInterval(() => {}, 60_000);

// Reference unused config to avoid TS warnings
void config;
