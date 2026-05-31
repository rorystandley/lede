import { api } from './client.js';
import type { AIProvider } from '@news-reader/shared';

export const aiApi = {
  summarize: (articleId: string) =>
    api.post<{ summary: string }>(`/ai/summarize/${articleId}`),

  suggestTags: (articleId: string) =>
    api.post<{ tags: string[] }>(`/ai/suggest-tags/${articleId}`),

  getConfig: () =>
    api.get<{ provider: AIProvider | null; hasKey: boolean }>('/ai/config'),

  updateConfig: (provider: AIProvider | null, apiKey: string | null) =>
    api.put('/ai/config', { provider, apiKey }),
};
