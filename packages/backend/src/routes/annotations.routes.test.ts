import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listForArticleMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('../services/annotation.service.js', () => ({
  annotationService: {
    listForArticle: mocks.listForArticleMock,
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

  const { default: annotationRoutes } = await import('./annotations.routes.js');
  await app.register(annotationRoutes, { prefix: '/annotations' });
  return app;
}

describe('annotations.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists annotations for an article and creates highlight annotations', async () => {
    mocks.listForArticleMock.mockResolvedValue([{ id: 'ann-1', type: 'highlight' }]);
    mocks.createMock.mockResolvedValue({ id: 'ann-2', type: 'highlight' });

    const app = await buildApp();

    try {
      const listResponse = await app.inject({
        method: 'GET',
        url: '/annotations/articles/6d4c1399-67cb-4106-b056-bf3415349cbf',
      });
      const createResponse = await app.inject({
        method: 'POST',
        url: '/annotations',
        payload: {
          articleId: '6d4c1399-67cb-4106-b056-bf3415349cbf',
          type: 'highlight',
          startOffset: 12,
          endOffset: 40,
          color: '#ffcc00',
        },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual([{ id: 'ann-1', type: 'highlight' }]);
      expect(mocks.listForArticleMock).toHaveBeenCalledWith('user-1', '6d4c1399-67cb-4106-b056-bf3415349cbf');

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json()).toEqual({ id: 'ann-2', type: 'highlight' });
      expect(mocks.createMock).toHaveBeenCalledWith('user-1', '6d4c1399-67cb-4106-b056-bf3415349cbf', {
        articleId: '6d4c1399-67cb-4106-b056-bf3415349cbf',
        type: 'highlight',
        startOffset: 12,
        endOffset: 40,
        color: '#ffcc00',
      });
    } finally {
      await app.close();
    }
  });

  it('updates and deletes annotations', async () => {
    mocks.updateMock.mockResolvedValue({ id: 'ann-1', content: 'Updated note' });
    mocks.deleteMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: '/annotations/ann-1',
        payload: { content: 'Updated note', color: '#00ff00' },
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/annotations/ann-1',
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({ id: 'ann-1', content: 'Updated note' });
      expect(mocks.updateMock).toHaveBeenCalledWith('user-1', 'ann-1', { content: 'Updated note', color: '#00ff00' });

      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.deleteMock).toHaveBeenCalledWith('user-1', 'ann-1');
    } finally {
      await app.close();
    }
  });
});
