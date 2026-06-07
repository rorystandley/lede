import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  queueInstances,
  QueueMock,
  getConfigMock,
} = vi.hoisted(() => {
  const queueInstances: any[] = [];
  const QueueMock = vi.fn(function Queue(this: any, name: string, opts: unknown) {
    this.name = name;
    this.opts = opts;
    this.close = vi.fn();
    this.upsertJobScheduler = vi.fn();
    queueInstances.push(this);
  });
  return {
    queueInstances,
    QueueMock,
    getConfigMock: vi.fn(() => ({ REDIS_URL: 'redis://localhost:6380' })),
  };
});

vi.mock('bullmq', () => ({
  Queue: QueueMock,
}));

vi.mock('../config.js', () => ({
  getConfig: getConfigMock,
}));

describe('queues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    queueInstances.length = 0;
  });

  it('parses redis options and memoizes queue instances', async () => {
    const queues = await import('./index.js');

    expect(queues.getRedisOpts()).toEqual({
      host: 'localhost',
      port: 6380,
      maxRetriesPerRequest: null,
    });

    const feedA = queues.getFeedRefreshQueue();
    const feedB = queues.getFeedRefreshQueue();
    const rule = queues.getRuleEngineQueue();
    const ruleAgain = queues.getRuleEngineQueue();
    const digest = queues.getDigestBuildQueue();
    const content = queues.getContentExtractQueue();
    const contentAgain = queues.getContentExtractQueue();

    expect(feedA).toBe(feedB);
    expect(ruleAgain).toBe(rule);
    expect(contentAgain).toBe(content);
    expect(QueueMock).toHaveBeenCalledTimes(4);
    expect(rule.name).toBe('rule-engine');
    expect(digest.name).toBe('digest-build');
    expect(content.name).toBe('content-extract');
  });

  it('uses the default redis port when none is present in the url', async () => {
    getConfigMock.mockReturnValueOnce({ REDIS_URL: 'redis://localhost' });
    const queues = await import('./index.js');

    expect(queues.getRedisOpts()).toEqual({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('schedules recurring jobs and closes/reset queues', async () => {
    const queues = await import('./index.js');

    queues.getFeedRefreshQueue();
    queues.getRuleEngineQueue();
    queues.getDigestBuildQueue();
    queues.getContentExtractQueue();

    await queues.setupRecurringJobs();

    const [feedQueue, , digestQueue, contentQueue] = queueInstances;
    expect(feedQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'refresh-all-feeds',
      { every: 15 * 60 * 1000 },
      { name: 'refresh-all-feeds', data: {} },
    );
    expect(digestQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'check-digest-schedule',
      { every: 60 * 1000 },
      { name: 'check-digest-schedule', data: {} },
    );

    await queues.closeQueues();

    expect(feedQueue.close).toHaveBeenCalled();
    expect(contentQueue.close).toHaveBeenCalled();

    const freshFeedQueue = queues.getFeedRefreshQueue();
    expect(freshFeedQueue).not.toBe(feedQueue);
  });

  it('can close an empty queue set without errors', async () => {
    const queues = await import('./index.js');

    await expect(queues.closeQueues()).resolves.toBeUndefined();
  });
});
