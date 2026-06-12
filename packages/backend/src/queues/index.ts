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
let _contentExtractQueue: Queue | null = null;

const _intervalIds: ReturnType<typeof setInterval>[] = [];

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

export function getContentExtractQueue(): Queue {
  if (_contentExtractQueue) return _contentExtractQueue;
  _contentExtractQueue = new Queue('content-extract', { connection: getRedisOpts() });
  return _contentExtractQueue;
}

export const FEED_REFRESH_INTERVAL = 15 * 60 * 1000;
export const DIGEST_CHECK_INTERVAL = 60 * 1000;

export async function setupRecurringJobs() {
  const feedQueue = getFeedRefreshQueue();
  const digestQueue = getDigestBuildQueue();

  await feedQueue.add('refresh-all-feeds', {});
  await digestQueue.add('check-digest-schedule', {});

  _intervalIds.push(
    setInterval(() => { feedQueue.add('refresh-all-feeds', {}).catch(() => {}); }, FEED_REFRESH_INTERVAL),
    setInterval(() => { digestQueue.add('check-digest-schedule', {}).catch(() => {}); }, DIGEST_CHECK_INTERVAL),
  );
}

export async function closeQueues() {
  for (const id of _intervalIds) clearInterval(id);
  _intervalIds.length = 0;

  for (const q of [_feedRefreshQueue, _ruleEngineQueue, _digestBuildQueue, _contentExtractQueue]) {
    if (q) await q.close();
  }
  _feedRefreshQueue = null;
  _ruleEngineQueue = null;
  _digestBuildQueue = null;
  _contentExtractQueue = null;
}
