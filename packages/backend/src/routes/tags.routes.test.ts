import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listForUserMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  tagArticleMock: vi.fn(),
  applyTagsByNameMock: vi.fn(),
}));

vi.mock('../services/tag.service.js', () => ({
  tagService: {
    listForUser: mocks.listForUserMock,
    create: mocks.createMock,
    update: mocks.updateMock,
    delete: mocks.deleteMock,
    tagArticle: mocks.tagArticleMock,
    applyTagsByName: mocks.applyTagsByNameMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: tagsRoutes } = await import('./tags.routes.js');
  await app.register(tagsRoutes, { prefix: '/tags' });
  return app;
}

describe('tags.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists, creates, updates, and deletes tags', async () => {
    mocks.listForUserMock.mockResolvedValue([{ id: 'tag-1', name: 'AI' }]);
    mocks.createMock.mockResolvedValue({ id: 'tag-2', name: 'Priority' });
    mocks.updateMock.mockResolvedValue({ id: 'tag-1', name: 'AI updated' });
    mocks.deleteMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const listResponse = await app.inject({ method: 'GET', url: '/tags' });
      const createResponse = await app.inject({
        method: 'POST',
        url: '/tags',
        payload: { name: 'Priority', color: '#112233' },
      });
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: '/tags/tag-1',
        payload: { name: 'AI updated', color: null },
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/tags/tag-1',
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual([{ id: 'tag-1', name: 'AI' }]);
      expect(mocks.listForUserMock).toHaveBeenCalledWith('user-1');

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json()).toEqual({ id: 'tag-2', name: 'Priority' });
      expect(mocks.createMock).toHaveBeenCalledWith('user-1', 'Priority', '#112233');

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({ id: 'tag-1', name: 'AI updated' });
      expect(mocks.updateMock).toHaveBeenCalledWith('user-1', 'tag-1', { name: 'AI updated', color: null });

      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.deleteMock).toHaveBeenCalledWith('user-1', 'tag-1');
    } finally {
      await app.close();
    }
  });

  it('applies tags to an article by id and by name', async () => {
    mocks.tagArticleMock.mockResolvedValue(undefined);
    mocks.applyTagsByNameMock.mockResolvedValue(2);

    const app = await buildApp();

    try {
      const setResponse = await app.inject({
        method: 'PUT',
        url: '/tags/articles/6d4c1399-67cb-4106-b056-bf3415349cbf',
        payload: {
          tagIds: [
            '31f2d36d-d503-4020-b746-8b55d5e26e57',
            '2b664685-3df9-4876-89b4-2be0a5504ec5',
          ],
        },
      });
      const byNameResponse = await app.inject({
        method: 'POST',
        url: '/tags/articles/6d4c1399-67cb-4106-b056-bf3415349cbf/by-name',
        payload: {
          names: ['AI', 'ML'],
          source: 'ai',
        },
      });

      expect(setResponse.statusCode).toBe(204);
      expect(mocks.tagArticleMock).toHaveBeenCalledWith(
        'user-1',
        '6d4c1399-67cb-4106-b056-bf3415349cbf',
        ['31f2d36d-d503-4020-b746-8b55d5e26e57', '2b664685-3df9-4876-89b4-2be0a5504ec5'],
      );

      expect(byNameResponse.statusCode).toBe(200);
      expect(byNameResponse.json()).toEqual({ applied: 2 });
      expect(mocks.applyTagsByNameMock).toHaveBeenCalledWith(
        'user-1',
        '6d4c1399-67cb-4106-b056-bf3415349cbf',
        ['AI', 'ML'],
        'ai',
      );
    } finally {
      await app.close();
    }
  });
});
