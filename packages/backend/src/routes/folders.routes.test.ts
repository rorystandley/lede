import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listForUserMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('../services/folder.service.js', () => ({
  folderService: {
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

  const { default: folderRoutes } = await import('./folders.routes.js');
  await app.register(folderRoutes, { prefix: '/folders' });
  return app;
}

describe('folders.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists and creates folders for the authenticated user', async () => {
    mocks.listForUserMock.mockResolvedValue([{ id: 'folder-1', name: 'Tech' }]);
    mocks.createMock.mockResolvedValue({ id: 'folder-2', name: 'Saved' });

    const app = await buildApp();

    try {
      const listResponse = await app.inject({ method: 'GET', url: '/folders' });
      const createResponse = await app.inject({
        method: 'POST',
        url: '/folders',
        payload: { name: 'Saved', parentId: null },
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual([{ id: 'folder-1', name: 'Tech' }]);
      expect(mocks.listForUserMock).toHaveBeenCalledWith('user-1');

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json()).toEqual({ id: 'folder-2', name: 'Saved' });
      expect(mocks.createMock).toHaveBeenCalledWith('user-1', 'Saved', null);
    } finally {
      await app.close();
    }
  });

  it('updates and deletes folders', async () => {
    mocks.updateMock.mockResolvedValue({ id: 'folder-1', name: 'Renamed' });
    mocks.deleteMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: '/folders/folder-1',
        payload: { name: 'Renamed' },
      });
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/folders/folder-1',
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toEqual({ id: 'folder-1', name: 'Renamed' });
      expect(mocks.updateMock).toHaveBeenCalledWith('user-1', 'folder-1', { name: 'Renamed' });

      expect(deleteResponse.statusCode).toBe(204);
      expect(mocks.deleteMock).toHaveBeenCalledWith('user-1', 'folder-1');
    } finally {
      await app.close();
    }
  });
});
