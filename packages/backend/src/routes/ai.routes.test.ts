import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceNotFoundError } from '../services/access-control.service.js';

const mocks = vi.hoisted(() => ({
  summarizeMock: vi.fn(),
  suggestTagsMock: vi.fn(),
  getUserAIConfigMock: vi.fn(),
  getUsageStatsMock: vi.fn(),
  updateUserAIConfigMock: vi.fn(),
}));

vi.mock('../services/ai.service.js', () => ({
  aiService: {
    summarize: mocks.summarizeMock,
    suggestTags: mocks.suggestTagsMock,
    getUserAIConfig: mocks.getUserAIConfigMock,
    getUsageStats: mocks.getUsageStatsMock,
    updateUserAIConfig: mocks.updateUserAIConfigMock,
  },
}));

let authenticatedUser = { id: 'user-1', email: 'reader@example.com' };

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (req) => {
    (req as typeof req & { user: typeof authenticatedUser }).user = authenticatedUser;
  });

  const { default: aiRoutes } = await import('./ai.routes.js');
  await app.register(aiRoutes, { prefix: '/ai' });
  return app;
}

describe('ai.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('summarizes articles and returns a helpful 400 when AI is unavailable', async () => {
    mocks.summarizeMock.mockResolvedValueOnce('Short summary');
    mocks.summarizeMock.mockResolvedValueOnce(null);

    const app = await buildApp();

    try {
      const okResponse = await app.inject({ method: 'POST', url: '/ai/summarize/article-1' });
      const badResponse = await app.inject({ method: 'POST', url: '/ai/summarize/article-2' });

      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({ summary: 'Short summary' });
      expect(mocks.summarizeMock).toHaveBeenNthCalledWith(1, 'user-1', 'article-1');

      expect(badResponse.statusCode).toBe(400);
      expect(badResponse.json()).toEqual({ error: 'AI not configured or summarization failed' });
    } finally {
      await app.close();
    }
  });

  it('handles tag suggestion success, missing config, not-found, and internal errors', async () => {
    mocks.suggestTagsMock.mockResolvedValueOnce(['ai', 'ml']);
    mocks.suggestTagsMock.mockResolvedValueOnce(null);
    mocks.suggestTagsMock.mockRejectedValueOnce(new ResourceNotFoundError('Article'));
    mocks.suggestTagsMock.mockRejectedValueOnce(new Error('boom'));

    const app = await buildApp();

    try {
      const okResponse = await app.inject({ method: 'POST', url: '/ai/suggest-tags/article-1' });
      const missingConfigResponse = await app.inject({ method: 'POST', url: '/ai/suggest-tags/article-2' });
      const notFoundResponse = await app.inject({ method: 'POST', url: '/ai/suggest-tags/article-3' });
      const failedResponse = await app.inject({ method: 'POST', url: '/ai/suggest-tags/article-4' });

      expect(okResponse.statusCode).toBe(200);
      expect(okResponse.json()).toEqual({ tags: ['ai', 'ml'] });

      expect(missingConfigResponse.statusCode).toBe(400);
      expect(missingConfigResponse.json()).toEqual({ error: 'AI not configured. Add an API key in Settings.' });

      expect(notFoundResponse.statusCode).toBe(404);
      expect(notFoundResponse.json().message).toMatch(/Article not found/);

      expect(failedResponse.statusCode).toBe(500);
      expect(failedResponse.json()).toEqual({ error: 'AI request failed. Check your API key or try again.' });
    } finally {
      await app.close();
    }
  });

  it('returns config and usage and updates ai config', async () => {
    mocks.getUserAIConfigMock.mockResolvedValue({ provider: 'openai', hasKey: true });
    mocks.getUsageStatsMock.mockResolvedValue({ today: { calls: 1, costUsd: 0.1 } });
    mocks.updateUserAIConfigMock.mockResolvedValue(undefined);

    const app = await buildApp();

    try {
      const configResponse = await app.inject({ method: 'GET', url: '/ai/config' });
      const usageResponse = await app.inject({ method: 'GET', url: '/ai/usage' });
      const updateResponse = await app.inject({
        method: 'PUT',
        url: '/ai/config',
        payload: { provider: 'anthropic', apiKey: 'sk-test' },
      });

      expect(configResponse.statusCode).toBe(200);
      expect(configResponse.json()).toEqual({ provider: 'openai', hasKey: true });
      expect(usageResponse.statusCode).toBe(200);
      expect(usageResponse.json()).toEqual({ today: { calls: 1, costUsd: 0.1 } });
      expect(updateResponse.statusCode).toBe(204);
      expect(mocks.updateUserAIConfigMock).toHaveBeenCalledWith('user-1', 'anthropic', 'sk-test');
    } finally {
      await app.close();
    }
  });
});
