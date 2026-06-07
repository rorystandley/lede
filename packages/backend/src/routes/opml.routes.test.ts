import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  importOpmlMock: vi.fn(),
  exportOpmlMock: vi.fn(),
}));

vi.mock('../services/opml.service.js', () => ({
  opmlService: {
    importOpml: mocks.importOpmlMock,
    exportOpml: mocks.exportOpmlMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: opmlRoutes } = await import('./opml.routes.js');
  await app.register(opmlRoutes, { prefix: '/opml' });
  return app;
}

describe('opml.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid import payloads and imports valid opml', async () => {
    mocks.importOpmlMock.mockResolvedValue({ imported: 2, failed: 0, errors: [] });

    const app = await buildApp();

    try {
      const badResponse = await app.inject({
        method: 'POST',
        url: '/opml/import',
        payload: {},
      });
      const okResponse = await app.inject({
        method: 'POST',
        url: '/opml/import',
        payload: { opml: '<opml />' },
      });

      expect(badResponse.statusCode).toBe(400);
      expect(badResponse.json()).toEqual({ error: 'opml field is required as a string' });

      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({ imported: 2, failed: 0, errors: [] });
      expect(mocks.importOpmlMock).toHaveBeenCalledWith('user-1', '<opml />');
    } finally {
      await app.close();
    }
  });

  it('exports opml with the correct headers', async () => {
    mocks.exportOpmlMock.mockResolvedValue('<opml><body /></opml>');

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/opml/export',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.headers['content-disposition']).toBe('attachment; filename="lede-export.opml"');
      expect(response.body).toBe('<opml><body /></opml>');
      expect(mocks.exportOpmlMock).toHaveBeenCalledWith('user-1');
    } finally {
      await app.close();
    }
  });
});
