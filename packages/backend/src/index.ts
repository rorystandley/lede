import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { setupRecurringJobs, closeQueues } from './queues/index.js';
import { createFeedRefreshWorker } from './workers/feed-refresh.worker.js';
import { createRuleEngineWorker } from './workers/rule-engine.worker.js';
import { createDigestBuildWorker } from './workers/digest-build.worker.js';
import { createContentExtractWorker } from './workers/content-extract.worker.js';
import { closeDb } from './db/client.js';

const app = await buildApp();
const config = getConfig();
const runWorkers = config.PROCESS_ROLE === 'all';

const workers = runWorkers ? {
  feedRefresh: createFeedRefreshWorker(),
  ruleEngine: createRuleEngineWorker(),
  digestBuild: createDigestBuildWorker(),
  contentExtract: createContentExtractWorker(),
} : null;

if (runWorkers) {
  await setupRecurringJobs();
  app.log.info('Workers running in-process (PROCESS_ROLE=all)');
} else {
  app.log.info(`Workers NOT running in this process (PROCESS_ROLE=${config.PROCESS_ROLE}). Run packages/backend/dist/worker.js separately.`);
}

await app.listen({ port: config.PORT, host: '0.0.0.0' });
app.log.info(`Server listening on http://localhost:${config.PORT}`);
app.log.info(`API docs at http://localhost:${config.PORT}/api/docs`);

async function shutdown() {
  app.log.info('Shutting down...');
  if (workers) {
    await workers.feedRefresh.close();
    await workers.ruleEngine.close();
    await workers.digestBuild.close();
    await workers.contentExtract.close();
  }
  await closeQueues();
  await app.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
