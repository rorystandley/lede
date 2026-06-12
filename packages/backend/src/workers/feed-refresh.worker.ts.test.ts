import { beforeEach, describe, expect, it, vi } from 'vitest';

const { WorkerMock, getDbMock, feedServiceMock, getRedisOptsMock, metricsStubs } = vi.hoisted(() => {
  const workerInstances: any[] = [];
  const WorkerMock = vi.fn(function Worker(this: any, name: string, processor: any, opts: any) {
    this.name = name;
    this.processor = processor;
    this.opts = opts;
    this.on = vi.fn();
    this.close = vi.fn();
    workerInstances.push(this);
  });

  return {
    workerInstances,
    WorkerMock,
    getDbMock: vi.fn(),
    feedServiceMock: {
      refreshFeed: vi.fn(),
    },
    getRedisOptsMock: vi.fn(() => ({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    })),
    metricsStubs: {
      feedsRefreshed: { inc: vi.fn() },
      articlesIngested: { inc: vi.fn() },
      queueJobsProcessed: { inc: vi.fn() },
      queueJobDuration: { observe: vi.fn() },
    },
  };
});

vi.mock('bullmq', () => ({ Worker: WorkerMock }));
vi.mock('../db/client.js', () => ({ getDb: getDbMock }));
vi.mock('../services/feed.service.js', () => ({ feedService: feedServiceMock }));
vi.mock('../queues/index.js', () => ({ getRedisOpts: getRedisOptsMock }));
vi.mock('../lib/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock('../lib/metrics.js', () => metricsStubs);

describe('feed-refresh worker', () => {
  let processor: (job: any) => Promise<any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { createFeedRefreshWorker } = await import('./feed-refresh.worker.js');
    createFeedRefreshWorker();
    processor = WorkerMock.mock.calls[0][1];
  });

  it('refreshes a single feed when feedId is provided', async () => {
    feedServiceMock.refreshFeed.mockResolvedValueOnce({ newArticles: 3 });

    const result = await processor({ data: { feedId: 'feed-1' } });

    expect(feedServiceMock.refreshFeed).toHaveBeenCalledWith('feed-1');
    expect(result).toEqual({ newArticles: 3 });
    expect(metricsStubs.feedsRefreshed.inc).toHaveBeenCalledWith({ status: 'success' });
    expect(metricsStubs.articlesIngested.inc).toHaveBeenCalledWith(3);
  });

  it('queries for stale feeds and refreshes them when no feedId', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: 'feed-a', refreshInterval: 60 },
          { id: 'feed-b', refreshInterval: 30 },
        ]),
      }),
    });
    getDbMock.mockReturnValue({ select: selectMock });

    feedServiceMock.refreshFeed
      .mockResolvedValueOnce({ newArticles: 2 })
      .mockResolvedValueOnce({ newArticles: 1 });

    const result = await processor({ data: {} });

    expect(feedServiceMock.refreshFeed).toHaveBeenCalledWith('feed-a');
    expect(feedServiceMock.refreshFeed).toHaveBeenCalledWith('feed-b');
    expect(result).toEqual({ totalNew: 3 });
    expect(metricsStubs.feedsRefreshed.inc).toHaveBeenCalledTimes(2);
  });

  it('continues refreshing other feeds when one fails', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: 'feed-ok', refreshInterval: 60 },
          { id: 'feed-fail', refreshInterval: 60 },
        ]),
      }),
    });
    getDbMock.mockReturnValue({ select: selectMock });

    feedServiceMock.refreshFeed
      .mockResolvedValueOnce({ newArticles: 5 })
      .mockRejectedValueOnce(new Error('network timeout'));

    const result = await processor({ data: {} });

    expect(result).toEqual({ totalNew: 5 });
    expect(metricsStubs.feedsRefreshed.inc).toHaveBeenCalledWith({ status: 'success' });
    expect(metricsStubs.feedsRefreshed.inc).toHaveBeenCalledWith({ status: 'error' });
  });
});
