import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLatestMock: vi.fn(),
  buildDigestMock: vi.fn(),
  listForUserMock: vi.fn(),
  markDeliveredMock: vi.fn(),
}));

vi.mock('../services/digest.service.js', () => ({
  digestService: {
    getLatest: mocks.getLatestMock,
    buildDigest: mocks.buildDigestMock,
    listForUser: mocks.listForUserMock,
    markDelivered: mocks.markDeliveredMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: digestsRoutes } = await import('./digests.routes.js');
  await app.register(digestsRoutes, { prefix: '/digests' });
  return app;
}

describe('digests.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns latest digest or 404 when one does not exist', async () => {
    mocks.getLatestMock.mockResolvedValueOnce({ id: 'digest-1' });
    mocks.getLatestMock.mockResolvedValueOnce(null);

    const app = await buildApp();

    try {
      const okResponse = await app.inject({ method: 'GET', url: '/digests/latest' });
      const missingResponse = await app.inject({ method: 'GET', url: '/digests/latest' });

      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({ id: 'digest-1' });
      expect(missingResponse.statusCode).toBe(404);
      expect(missingResponse.json()).toEqual({ error: 'No digest found' });
    } finally {
      await app.close();
    }
  });

  it('builds, lists, and marks digests delivered', async () => {
    mocks.buildDigestMock.mockResolvedValue({ id: 'digest-2' });
    mocks.listForUserMock.mockResolvedValue([{ id: 'digest-1' }]);
    mocks.markDeliveredMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const buildResponse = await app.inject({ method: 'POST', url: '/digests/build' });
      const listResponse = await app.inject({ method: 'GET', url: '/digests' });
      const deliveredResponse = await app.inject({ method: 'PATCH', url: '/digests/digest-1/delivered' });

      expect(buildResponse.statusCode).toBe(201);
      expect(buildResponse.json()).toEqual({ id: 'digest-2' });
      expect(mocks.buildDigestMock).toHaveBeenCalledWith('user-1');

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json()).toEqual([{ id: 'digest-1' }]);
      expect(mocks.listForUserMock).toHaveBeenCalledWith('user-1');

      expect(deliveredResponse.statusCode).toBe(204);
      expect(mocks.markDeliveredMock).toHaveBeenCalledWith('user-1', 'digest-1');
    } finally {
      await app.close();
    }
  });
});
