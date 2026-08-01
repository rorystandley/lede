import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchMock: vi.fn(),
  listForUserMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('../services/article.service.js', () => ({
  articleService: {
    search: mocks.searchMock,
  },
}));

vi.mock('../services/saved-search.service.js', () => ({
  savedSearchService: {
    listForUser: mocks.listForUserMock,
    create: mocks.createMock,
    update: mocks.updateMock,
    delete: mocks.deleteMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: searchRoutes } = await import('./search.routes.js');
  await app.register(searchRoutes, { prefix: '/search' });
  return app;
}

describe('search.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches articles and lists saved searches', async () => {
    mocks.searchMock.mockResolvedValue({ items: [{ id: 'article-1' }], total: 1 });
    mocks.listForUserMock.mockResolvedValue([{ id: 'saved-1', name: 'Digest' }]);

    const app = await buildApp();

    try {
      const searchResponse = await app.inject({
        method: 'GET',
        url: '/search?q=ai&page=2&pageSize=5',
      });
      const savedResponse = await app.inject({
        method: 'GET',
        url: '/search/saved',
      });

      expect(searchResponse.statusCode).toBe(200);
      expect(searchResponse.json()).toEqual({ items: [{ id: 'article-1' }], total: 1 });
      expect(mocks.searchMock).toHaveBeenCalledWith('user-1', expect.objectContaining({ q: 'ai', page: 2, pageSize: 5 }));

      expect(savedResponse.statusCode).toBe(200);
      expect(savedResponse.json()).toEqual([{ id: 'saved-1', name: 'Digest' }]);
      expect(mocks.listForUserMock).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });

  it('creates, updates, and deletes saved searches', async () => {
    mocks.createMock.mockResolvedValue({ id: 'saved-2', name: 'AI' });
    mocks.updateMock.mockResolvedValue({ id: 'saved-2', isMonitor: true });
    mocks.deleteMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/search/saved',
        payload: {
          name: 'AI',
          query: 'gpt',
          filters: {
            feedIds: ['6d4c1399-67cb-4106-b056-bf3415349cbf'],
            isRead: false,
          },
          isMonitor: true,
        },
      });
      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/search/saved/saved-2',
        payload: {
          name: 'AI updated',
          filters: null,
          isMonitor: false,
        },
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/search/saved/saved-2',
      });

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json()).toEqual({ id: 'saved-2', name: 'AI' });
      expect(mocks.createMock).toHaveBeenCalledWith('user-1', {
        name: 'AI',
        query: 'gpt',
        filters: {
          feedIds: ['6d4c1399-67cb-4106-b056-bf3415349cbf'],
          isRead: false,
        },
        isMonitor: true,
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({ id: 'saved-2', isMonitor: true });
      expect(mocks.updateMock).toHaveBeenCalledWith('user-1', 'saved-2', {
        name: 'AI updated',
        filters: null,
        isMonitor: false,
      });

      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.deleteMock).toHaveBeenCalledWith('user-1', 'saved-2');
    } finally {
      await app.close();
    }
  });
});
