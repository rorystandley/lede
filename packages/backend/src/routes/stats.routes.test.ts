import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSummaryMock: vi.fn(),
  getDailyStatsMock: vi.fn(),
  recordArticleReadMock: vi.fn(),
}));

vi.mock('../services/stats.service.js', () => ({
  statsService: {
    getSummary: mocks.getSummaryMock,
    getDailyStats: mocks.getDailyStatsMock,
    recordArticleRead: mocks.recordArticleReadMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: statsRoutes } = await import('./stats.routes.js');
  await app.register(statsRoutes, { prefix: '/stats' });
  return app;
}

describe('stats.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns summary and daily stats', async () => {
    mocks.getSummaryMock.mockResolvedValue({ totalRead: 12 });
    mocks.getDailyStatsMock.mockResolvedValue([{ date: '2026-06-05', read: 3 }]);

    const app = await buildApp();

    try {
      const summaryResponse = await app.inject({ method: 'GET', url: '/stats/summary' });
      const dailyResponse = await app.inject({ method: 'GET', url: '/stats/daily?days=14' });

      expect(summaryResponse.statusCode).toBe(200);
      expect(summaryResponse.json()).toEqual({ totalRead: 12 });
      expect(mocks.getSummaryMock).toHaveBeenCalledWith('user-1');

      expect(dailyResponse.statusCode).toBe(200);
      expect(dailyResponse.json()).toEqual([{ date: '2026-06-05', read: 3 }]);
      expect(mocks.getDailyStatsMock).toHaveBeenCalledWith('user-1', 14);
    } finally {
      await app.close();
    }
  });

  it('records reading time', async () => {
    mocks.recordArticleReadMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/stats/track',
        payload: {
          articleId: '81992c37-c508-4267-a7d7-2a08b6d012a6',
          readingTimeMs: 45000,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(mocks.recordArticleReadMock).toHaveBeenCalledWith(
        'user-1',
        '81992c37-c508-4267-a7d7-2a08b6d012a6',
        45000,
      );
    } finally {
      await app.close();
    }
  });
});
