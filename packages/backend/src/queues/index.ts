import { Queue } from 'bullmq';
import { getConfig } from '../config.js';

export function getRedisOpts() {
  const config = getConfig();
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    maxRetriesPerRequest: null as null,
  };
}

let _feedRefreshQueue: Queue | null = null;
let _ruleEngineQueue: Queue | null = null;
let _digestBuildQueue: Queue | null = null;

export function getFeedRefreshQueue(): Queue {
  if (_feedRefreshQueue) return _feedRefreshQueue;
  _feedRefreshQueue = new Queue('feed-refresh', { connection: getRedisOpts() });
  return _feedRefreshQueue;
}

export function getRuleEngineQueue(): Queue {
  if (_ruleEngineQueue) return _ruleEngineQueue;
  _ruleEngineQueue = new Queue('rule-engine', { connection: getRedisOpts() });
  return _ruleEngineQueue;
}

export function getDigestBuildQueue(): Queue {
  if (_digestBuildQueue) return _digestBuildQueue;
  _digestBuildQueue = new Queue('digest-build', { connection: getRedisOpts() });
  return _digestBuildQueue;
}

export async function setupRecurringJobs() {
  const feedQueue = getFeedRefreshQueue();
  await feedQueue.upsertJobScheduler(
    'refresh-all-feeds',
    { every: 15 * 60 * 1000 },
    { name: 'refresh-all-feeds', data: {} },
  );

  const digestQueue = getDigestBuildQueue();
  await digestQueue.upsertJobScheduler(
    'check-digest-schedule',
    { every: 60 * 1000 },
    { name: 'check-digest-schedule', data: {} },
  );
}

export async function closeQueues() {
  for (const q of [_feedRefreshQueue, _ruleEngineQueue, _digestBuildQueue]) {
    if (q) await q.close();
  }
  _feedRefreshQueue = null;
  _ruleEngineQueue = null;
  _digestBuildQueue = null;
}
