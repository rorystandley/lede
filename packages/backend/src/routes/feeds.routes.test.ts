import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listForUserMock: vi.fn(),
  subscribeMock: vi.fn(),
  updateSubscriptionMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  listSubscribedFeedIdsMock: vi.fn(),
  refreshFeedMock: vi.fn(),
  queueAddMock: vi.fn(),
}));

vi.mock('../services/feed.service.js', () => ({
  feedService: {
    listForUser: mocks.listForUserMock,
    subscribe: mocks.subscribeMock,
    updateSubscription: mocks.updateSubscriptionMock,
    unsubscribe: mocks.unsubscribeMock,
    listSubscribedFeedIds: mocks.listSubscribedFeedIdsMock,
    refreshFeed: mocks.refreshFeedMock,
  },
}));

vi.mock('../queues/index.js', () => ({
  getFeedRefreshQueue: () => ({
    add: mocks.queueAddMock,
  }),
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: feedRoutes } = await import('./feeds.routes.js');
  await app.register(feedRoutes, { prefix: '/feeds' });
  return app;
}

describe('feeds.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedUser = { id: 'user-1', email: 'reader@example.com' };
  });

  it('lists feeds and subscribes with a created response', async () => {
    mocks.listForUserMock.mockResolvedValue({ items: [{ id: 'feed-1' }], total: 1 });
    mocks.subscribeMock.mockResolvedValue({ id: 'feed-2' });

    const app = await buildApp();

    try {
      const listResponse = await app.inject({
        method: 'GET',
        url: '/feeds?folderId=91b2340f-bca8-45fd-ab85-cdb5f20ff835&page=3&pageSize=25',
      });
      const subscribeResponse = await app.inject({
        method: 'POST',
        url: '/feeds',
        payload: {
          url: 'https://example.com/rss.xml',
          folderId: '91b2340f-bca8-45fd-ab85-cdb5f20ff835',
          customTitle: 'Example Feed',
        },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({ items: [{ id: 'feed-1' }], total: 1 });
      expect(mocks.listForUserMock).toHaveBeenCalledWith('user-1', expect.objectContaining({
        folderId: '91b2340f-bca8-45fd-ab85-cdb5f20ff835',
        page: 3,
        pageSize: 25,
      }));

      expect(subscribeResponse.statusCode).toBe(201);
      expect(subscribeResponse.json()).toEqual({ id: 'feed-2' });
      expect(mocks.subscribeMock).toHaveBeenCalledWith(
        'user-1',
        'https://example.com/rss.xml',
        '91b2340f-bca8-45fd-ab85-cdb5f20ff835',
        'Example Feed',
      );
    } finally {
      await app.close();
    }
  });

  it('updates and deletes subscriptions', async () => {
    mocks.updateSubscriptionMock.mockResolvedValue(undefined);
    mocks.unsubscribeMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: '/feeds/feed-1',
        payload: {
          customTitle: 'Renamed Feed',
          folderId: null,
        },
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/feeds/feed-1',
      });

      expect(updateResponse.statusCode).toBe(204);
      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.updateSubscriptionMock).toHaveBeenCalledWith('user-1', 'feed-1', {
        customTitle: 'Renamed Feed',
        folderId: null,
      });
      expect(mocks.unsubscribeMock).toHaveBeenCalledWith('user-1', 'feed-1');
    } finally {
      await app.close();
    }
  });

  it('queues refreshes for all subscribed feeds', async () => {
    mocks.listSubscribedFeedIdsMock.mockResolvedValue(['feed-1', 'feed-2']);
    mocks.queueAddMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/feeds/refresh-all',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ queued: true, count: 2 });
      expect(mocks.listSubscribedFeedIdsMock).toHaveBeenCalledWith('user-1');
      expect(mocks.queueAddMock).toHaveBeenNthCalledWith(1, 'refresh', { feedId: 'feed-1' });
      expect(mocks.queueAddMock).toHaveBeenNthCalledWith(2, 'refresh', { feedId: 'feed-2' });
    } finally {
      await app.close();
    }
  });

  it('refreshes a single feed in the authenticated user context', async () => {
    mocks.refreshFeedMock.mockResolvedValue({ queued: true, feedId: 'feed-1' });

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/feeds/feed-1/refresh',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ queued: true, feedId: 'feed-1' });
      expect(mocks.refreshFeedMock).toHaveBeenCalledWith('feed-1', { userId: 'user-1' });
    } finally {
      await app.close();
    }
  });
});
