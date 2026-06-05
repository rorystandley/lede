import { api } from './client.js';
import type { AIProvider } from '@lede/shared';

interface AIUsageStats {
  today: { calls: number; costUsd: number };
  thisMonth: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  byOperation: { operation: string; count: number; costUsd: number }[];
  recent: { id: string; operation: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; createdAt: string }[];
}

export const aiApi = {
  summarize: (articleId: string) =>
    api.post<{ summary: string }>(`/ai/summarize/${articleId}`),

  suggestTags: (articleId: string) =>
    api.post<{ tags: string[] }>(`/ai/suggest-tags/${articleId}`),

  getConfig: () =>
    api.get<{ provider: AIProvider | null; hasKey: boolean }>('/ai/config'),

  getUsage: () =>
    api.get<AIUsageStats>('/ai/usage'),

  updateConfig: (provider: AIProvider | null, apiKey: string | null) =>
    api.put('/ai/config', { provider, apiKey }),
};
