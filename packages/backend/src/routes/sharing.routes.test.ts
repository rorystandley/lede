import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eqMock: vi.fn(),
  andMock: vi.fn(),
  whereMock: vi.fn(),
  innerJoinMock: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: mocks.eqMock,
  and: mocks.andMock,
}));

vi.mock('../db/schema/index.js', () => ({
  articles: {
    id: 'articles.id',
    title: 'articles.title',
    url: 'articles.url',
    author: 'articles.author',
    summary: 'articles.summary',
    publishedAt: 'articles.publishedAt',
    feedId: 'articles.feedId',
  },
  feeds: {
    id: 'feeds.id',
    title: 'feeds.title',
  },
  userFeedSubscriptions: {
    feedId: 'subs.feedId',
    userId: 'subs.userId',
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

  const { default: sharingRoutes } = await import('./sharing.routes.js');
  await app.register(sharingRoutes, { prefix: '/sharing' });
  return app;
}

describe('sharing.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eqMock.mockImplementation((left, right) => `${left}=${right}`);
    mocks.andMock.mockImplementation((...clauses) => clauses.join(' AND '));
    mocks.whereMock.mockResolvedValue([]);
    mocks.innerJoinMock.mockReturnValue({ innerJoin: mocks.innerJoinMock, where: mocks.whereMock });
    mocks.fromMock.mockReturnValue({ innerJoin: mocks.innerJoinMock });
    mocks.selectMock.mockReturnValue({ from: mocks.fromMock });
  });

  it('returns 404 when the article is not shareable for the current user', async () => {
    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/sharing/article/article-1',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Article not found' });
    } finally {
      await app.close();
    }
  });

  it('returns shareable article data and serializes dates', async () => {
    mocks.whereMock.mockResolvedValueOnce([{
      title: 'Shared article',
      url: 'https://example.com/article',
      author: 'Author',
      summary: 'Summary',
      publishedAt: new Date('2026-06-06T10:00:00.000Z'),
      feedTitle: 'Feed title',
    }]);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/sharing/article/article-2',
        headers: { host: 'news.test' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        title: 'Shared article',
        url: 'https://example.com/article',
        author: 'Author',
        summary: 'Summary',
        publishedAt: '2026-06-06T10:00:00.000Z',
        feedTitle: 'Feed title',
        shareUrl: 'https://example.com/article',
      });
    } finally {
      await app.close();
    }
  });

  it('falls back to the request origin when the article has no canonical url', async () => {
    mocks.whereMock.mockResolvedValueOnce([{
      title: 'Shared article',
      url: null,
      author: null,
      summary: null,
      publishedAt: null,
      feedTitle: 'Feed title',
    }]);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/sharing/article/article-3',
        headers: { host: 'news.test' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        title: 'Shared article',
        url: null,
        author: null,
        summary: null,
        publishedAt: null,
        feedTitle: 'Feed title',
        shareUrl: 'http://news.test',
      });
    } finally {
      await app.close();
    }
  });
});
