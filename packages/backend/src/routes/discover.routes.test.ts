import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eqMock: vi.fn(),
  selectWhereMock: vi.fn(),
  innerJoinMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  parseFeedMock: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: mocks.eqMock,
  and: vi.fn(),
}));

vi.mock('../lib/feed-directory.js', () => ({
  FEED_CATEGORIES: ['Tech', 'World', 'Science'],
  FEED_DIRECTORY: [
    { name: 'Tech Daily', description: 'Tech news', category: 'Tech', url: 'https://tech.example/feed.xml' },
    { name: 'World Wire', description: 'World news', category: 'World', url: 'https://world.example/feed.xml' },
    { name: 'Research Brief', description: 'Longform analysis', category: 'Science', url: 'https://science.example/feed.xml' },
  ],
}));

vi.mock('../lib/feed-parser.js', () => ({
  parseFeed: mocks.parseFeedMock,
}));

vi.mock('../db/schema/index.js', () => ({
  userFeedSubscriptions: {
    feedId: 'subs.feedId',
    userId: 'subs.userId',
  },
  feeds: {
    id: 'feeds.id',
    url: 'feeds.url',
  },
}));

vi.mock('../db/client.js', () => ({
  getDb: () => ({
    select: mocks.selectMock,
  }),
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: discoverRoutes } = await import('./discover.routes.js');
  await app.register(discoverRoutes, { prefix: '/discover' });
  return app;
}

describe('discover.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eqMock.mockImplementation((left, right) => `${left}=${right}`);
    mocks.selectWhereMock.mockResolvedValue([{ feedUrl: 'https://tech.example/feed.xml' }]);
    mocks.innerJoinMock.mockReturnValue({ where: mocks.selectWhereMock });
    mocks.fromMock.mockReturnValue({ innerJoin: mocks.innerJoinMock });
    mocks.selectMock.mockReturnValue({ from: mocks.fromMock });
  });

  it('filters the public feed directory by category and query', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/discover/directory?category=tech&q=daily',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        categories: ['Tech', 'World', 'Science'],
        feeds: [{ name: 'Tech Daily', description: 'Tech news', category: 'Tech', url: 'https://tech.example/feed.xml' }],
      });
    } finally {
      await app.close();
    }
  });

  it('matches public directory queries against description and category text', async () => {
    const app = await buildApp();

    try {
      const descriptionResponse = await app.inject({
        method: 'GET',
        url: '/discover/directory?q=tech%20news',
      });
      const categoryResponse = await app.inject({
        method: 'GET',
        url: '/discover/directory?q=world',
      });

      expect(descriptionResponse.statusCode).toBe(200);
      expect(descriptionResponse.json().feeds).toEqual([
        { name: 'Tech Daily', description: 'Tech news', category: 'Tech', url: 'https://tech.example/feed.xml' },
      ]);

      expect(categoryResponse.statusCode).toBe(200);
      expect(categoryResponse.json().feeds).toEqual([
        { name: 'World Wire', description: 'World news', category: 'World', url: 'https://world.example/feed.xml' },
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns the subscribed directory view with subscription flags', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/discover/directory/subscribed',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        categories: ['Tech', 'World', 'Science'],
        feeds: [
          { name: 'Tech Daily', description: 'Tech news', category: 'Tech', url: 'https://tech.example/feed.xml', isSubscribed: true },
          { name: 'World Wire', description: 'World news', category: 'World', url: 'https://world.example/feed.xml', isSubscribed: false },
          { name: 'Research Brief', description: 'Longform analysis', category: 'Science', url: 'https://science.example/feed.xml', isSubscribed: false },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('filters the subscribed directory view before applying subscription flags', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/discover/directory/subscribed?category=world&q=world',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        categories: ['Tech', 'World', 'Science'],
        feeds: [
          { name: 'World Wire', description: 'World news', category: 'World', url: 'https://world.example/feed.xml', isSubscribed: false },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('matches subscribed directory queries against description and category text', async () => {
    const app = await buildApp();

    try {
      const descriptionResponse = await app.inject({
        method: 'GET',
        url: '/discover/directory/subscribed?q=longform%20analysis',
      });
      const categoryResponse = await app.inject({
        method: 'GET',
        url: '/discover/directory/subscribed?q=science',
      });

      expect(descriptionResponse.statusCode).toBe(200);
      expect(descriptionResponse.json()).toEqual({
        categories: ['Tech', 'World', 'Science'],
        feeds: [
          { name: 'Research Brief', description: 'Longform analysis', category: 'Science', url: 'https://science.example/feed.xml', isSubscribed: false },
        ],
      });

      expect(categoryResponse.statusCode).toBe(200);
      expect(categoryResponse.json()).toEqual({
        categories: ['Tech', 'World', 'Science'],
        feeds: [
          { name: 'Research Brief', description: 'Longform analysis', category: 'Science', url: 'https://science.example/feed.xml', isSubscribed: false },
        ],
      });
    } finally {
      await app.close();
    }
  });

  it('detects feeds and returns a friendly parse error', async () => {
    mocks.parseFeedMock.mockResolvedValueOnce({
      title: 'Tech Daily',
      description: 'Tech news',
      siteUrl: 'https://tech.example',
      feedType: 'rss',
      items: [{}, {}],
    });
    mocks.parseFeedMock.mockRejectedValueOnce(new Error('Could not parse feed'));

    const app = await buildApp();

    try {
      const okResponse = await app.inject({
        method: 'POST',
        url: '/discover/detect',
        payload: { url: 'https://tech.example/feed.xml' },
      });
      const badResponse = await app.inject({
        method: 'POST',
        url: '/discover/detect',
        payload: { url: 'https://bad.example/feed.xml' },
      });

      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({
        valid: true,
        title: 'Tech Daily',
        description: 'Tech news',
        siteUrl: 'https://tech.example',
        feedType: 'rss',
        itemCount: 2,
        url: 'https://tech.example/feed.xml',
      });

      expect(badResponse.statusCode).toBe(400);
      expect(badResponse.json()).toEqual({
        valid: false,
        error: 'Could not parse feed',
        url: 'https://bad.example/feed.xml',
      });
    } finally {
      await app.close();
    }
  });

  it('falls back to a generic parse error for non-Error failures', async () => {
    mocks.parseFeedMock.mockRejectedValueOnce('bad payload');

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/discover/detect',
        payload: { url: 'https://bad.example/feed.xml' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        valid: false,
        error: 'Could not parse feed',
        url: 'https://bad.example/feed.xml',
      });
    } finally {
      await app.close();
    }
  });
});
