import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    this.add = vi.fn().mockResolvedValue({ id: '1' });
    this.upsertJobScheduler = vi.fn().mockResolvedValue({ id: '1' });
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
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    queueInstances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('registers durable repeatable schedulers and an immediate kick on startup', async () => {
    const queues = await import('./index.js');

    queues.getFeedRefreshQueue();
    queues.getRuleEngineQueue();
    queues.getDigestBuildQueue();
    queues.getContentExtractQueue();

    await queues.setupRecurringJobs();

    const [feedQueue, , digestQueue] = queueInstances;

    // Durable Redis-backed schedules — survive restarts, no in-process setInterval.
    expect(feedQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'refresh-all-feeds',
      { every: queues.FEED_REFRESH_INTERVAL },
      { name: 'refresh-all-feeds', data: {} },
    );
    expect(digestQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'check-digest-schedule',
      { every: queues.DIGEST_CHECK_INTERVAL },
      { name: 'check-digest-schedule', data: {} },
    );

    // Immediate boot-time kick so a fresh deploy doesn't wait a full interval.
    expect(feedQueue.add).toHaveBeenCalledWith('refresh-all-feeds', {});
    expect(digestQueue.add).toHaveBeenCalledWith('check-digest-schedule', {});

    // No in-process timers are scheduled any more.
    feedQueue.add.mockClear();
    digestQueue.add.mockClear();
    vi.advanceTimersByTime(queues.FEED_REFRESH_INTERVAL * 2);
    expect(feedQueue.add).not.toHaveBeenCalled();
    expect(digestQueue.add).not.toHaveBeenCalled();
  });

  it('closes queues on closeQueues and re-instantiates fresh queues afterwards', async () => {
    const queues = await import('./index.js');

    queues.getFeedRefreshQueue();
    queues.getRuleEngineQueue();
    queues.getDigestBuildQueue();
    queues.getContentExtractQueue();

    await queues.setupRecurringJobs();

    const [feedQueue, , , contentQueue] = queueInstances;

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
