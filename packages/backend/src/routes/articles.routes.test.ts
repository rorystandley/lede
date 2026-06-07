import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listMock: vi.fn(),
  searchMock: vi.fn(),
  getByIdMock: vi.fn(),
  markAllReadMock: vi.fn(),
  markReadMock: vi.fn(),
  markUnreadMock: vi.fn(),
  setStarMock: vi.fn(),
  setArchivedMock: vi.fn(),
  assertArticleAccessibleMock: vi.fn(),
  extractNowMock: vi.fn(),
}));

vi.mock('../services/article.service.js', () => ({
  articleService: {
    list: mocks.listMock,
    search: mocks.searchMock,
    getById: mocks.getByIdMock,
    markAllRead: mocks.markAllReadMock,
    markRead: mocks.markReadMock,
    markUnread: mocks.markUnreadMock,
    setStar: mocks.setStarMock,
    setArchived: mocks.setArchivedMock,
  },
}));

vi.mock('../services/access-control.service.js', () => ({
  accessControlService: {
    assertArticleAccessible: mocks.assertArticleAccessibleMock,
  },
}));

vi.mock('../services/extraction.service.js', () => ({
  extractionService: {
    extractNow: mocks.extractNowMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: articleRoutes } = await import('./articles.routes.js');
  await app.register(articleRoutes, { prefix: '/articles' });
  return app;
}

describe('articles.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedUser = { id: 'user-1', email: 'reader@example.com' };
  });

  it('lists and searches articles for the authenticated user', async () => {
    mocks.listMock.mockResolvedValue({ items: [{ id: 'article-1' }], hasMore: false });
    mocks.searchMock.mockResolvedValue({ items: [{ id: 'article-2' }], total: 1 });

    const app = await buildApp();

    try {
      const listResponse = await app.inject({
        method: 'GET',
        url: '/articles?page=2&pageSize=10&isRead=true',
      });
      const searchResponse = await app.inject({
        method: 'GET',
        url: '/articles/search?q=ai',
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual({ items: [{ id: 'article-1' }], hasMore: false });
      expect(mocks.listMock).toHaveBeenCalledWith('user-1', expect.objectContaining({
        page: 2,
        pageSize: 10,
        isRead: true,
      }));

      expect(searchResponse.statusCode).toBe(200);
      expect(searchResponse.json()).toEqual({ items: [{ id: 'article-2' }], total: 1 });
      expect(mocks.searchMock).toHaveBeenCalledWith('user-1', expect.objectContaining({
        q: 'ai',
        page: 1,
        pageSize: 20,
      }));
    } finally {
      await app.close();
    }
  });

  it('returns articles by id and 404 when missing', async () => {
    mocks.getByIdMock.mockResolvedValueOnce({ id: 'article-1', title: 'First' });
    mocks.getByIdMock.mockResolvedValueOnce(null);

    const app = await buildApp();

    try {
      const okResponse = await app.inject({
        method: 'GET',
        url: '/articles/article-1',
      });
      const missingResponse = await app.inject({
        method: 'GET',
        url: '/articles/article-2',
      });

      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({ id: 'article-1', title: 'First' });
      expect(mocks.getByIdMock).toHaveBeenNthCalledWith(1, 'user-1', 'article-1');

      expect(missingResponse.statusCode).toBe(404);
      expect(missingResponse.json()).toEqual({ error: 'Article not found' });
      expect(mocks.getByIdMock).toHaveBeenNthCalledWith(2, 'user-1', 'article-2');
    } finally {
      await app.close();
    }
  });

  it('re-extracts article content and returns a helpful error for failed extraction', async () => {
    mocks.assertArticleAccessibleMock.mockResolvedValue(undefined);
    mocks.extractNowMock.mockResolvedValueOnce({ status: 'full' });
    mocks.getByIdMock.mockResolvedValue({ id: 'article-1', title: 'Fresh article' });
    mocks.extractNowMock.mockResolvedValueOnce({ status: 'failed' });

    const app = await buildApp();

    try {
      const okResponse = await app.inject({
        method: 'POST',
        url: '/articles/article-1/extract',
      });
      const failedResponse = await app.inject({
        method: 'POST',
        url: '/articles/article-2/extract',
      });

      expect(mocks.assertArticleAccessibleMock).toHaveBeenNthCalledWith(1, 'user-1', 'article-1');
      expect(mocks.extractNowMock).toHaveBeenNthCalledWith(1, 'article-1');
      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({
        id: 'article-1',
        title: 'Fresh article',
        extractionStatus: 'full',
      });

      expect(mocks.assertArticleAccessibleMock).toHaveBeenNthCalledWith(2, 'user-1', 'article-2');
      expect(mocks.extractNowMock).toHaveBeenNthCalledWith(2, 'article-2');
      expect(failedResponse.statusCode).toBe(422);
      expect(failedResponse.json()).toEqual({
        status: 'failed',
        error: 'Could not get anything useful from the article URL — the site may block scrapers or require JavaScript.',
      });
    } finally {
      await app.close();
    }
  });

  it('marks articles read and unread, and applies star/archive state', async () => {
    mocks.markReadMock.mockResolvedValue(undefined);
    mocks.markUnreadMock.mockResolvedValue(undefined);
    mocks.setStarMock.mockResolvedValue(undefined);
    mocks.setArchivedMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const markReadResponse = await app.inject({
        method: 'POST',
        url: '/articles/mark-read',
        payload: {
          articleIds: [
            '6d4c1399-67cb-4106-b056-bf3415349cbf',
            'c91567fa-59f8-4db7-b146-8fb3e26781d1',
          ],
        },
      });
      const markUnreadResponse = await app.inject({
        method: 'POST',
        url: '/articles/mark-unread',
        payload: { articleIds: ['6d4c1399-67cb-4106-b056-bf3415349cbf'] },
      });
      const starResponse = await app.inject({
        method: 'PATCH',
        url: '/articles/article-1/star',
        payload: { isStarred: true },
      });
      const archiveResponse = await app.inject({
        method: 'PATCH',
        url: '/articles/article-1/archive',
        payload: { isArchived: false },
      });

      expect(markReadResponse.statusCode).toBe(204);
      expect(markUnreadResponse.statusCode).toBe(204);
      expect(starResponse.statusCode).toBe(204);
      expect(archiveResponse.statusCode).toBe(204);

      expect(mocks.markReadMock).toHaveBeenCalledWith('user-1', [
        '6d4c1399-67cb-4106-b056-bf3415349cbf',
        'c91567fa-59f8-4db7-b146-8fb3e26781d1',
      ]);
      expect(mocks.markUnreadMock).toHaveBeenCalledWith('user-1', ['6d4c1399-67cb-4106-b056-bf3415349cbf']);
      expect(mocks.setStarMock).toHaveBeenCalledWith('user-1', 'article-1', true);
      expect(mocks.setArchivedMock).toHaveBeenCalledWith('user-1', 'article-1', false);
    } finally {
      await app.close();
    }
  });

  it('marks all read within an optional scope', async () => {
    mocks.markAllReadMock.mockResolvedValue(5);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/articles/mark-all-read',
        payload: {
          feedId: '4f4bf22d-5ebf-4a69-b0a8-e76508c5e6b2',
          folderId: '38db61dc-0fb2-4965-9a2e-4dc8c9064f34',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ marked: 5 });
      expect(mocks.markAllReadMock).toHaveBeenCalledWith('user-1', {
        feedId: '4f4bf22d-5ebf-4a69-b0a8-e76508c5e6b2',
        folderId: '38db61dc-0fb2-4965-9a2e-4dc8c9064f34',
      });
    } finally {
      await app.close();
    }
  });

  it('treats an omitted mark-all-read body as an empty scope', async () => {
    mocks.markAllReadMock.mockResolvedValue(0);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/articles/mark-all-read',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ marked: 0 });
      expect(mocks.markAllReadMock).toHaveBeenCalledWith('user-1', {});
    } finally {
      await app.close();
    }
  });
});
