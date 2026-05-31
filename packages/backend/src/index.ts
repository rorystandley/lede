import 'dotenv/config';
import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { setupRecurringJobs, closeQueues } from './queues/index.js';
import { createFeedRefreshWorker } from './workers/feed-refresh.worker.js';
import { createRuleEngineWorker } from './workers/rule-engine.worker.js';
import { createDigestBuildWorker } from './workers/digest-build.worker.js';
import { closeDb } from './db/client.js';

const app = await buildApp();
const config = getConfig();

const feedRefreshWorker = createFeedRefreshWorker();
const ruleEngineWorker = createRuleEngineWorker();
const digestBuildWorker = createDigestBuildWorker();
await setupRecurringJobs();

await app.listen({ port: config.PORT, host: '0.0.0.0' });
app.log.info(`Server listening on http://localhost:${config.PORT}`);
app.log.info(`API docs at http://localhost:${config.PORT}/api/docs`);

async function shutdown() {
  app.log.info('Shutting down...');
  await feedRefreshWorker.close();
  await ruleEngineWorker.close();
  await digestBuildWorker.close();
  await closeQueues();
  await app.close();
  await closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
