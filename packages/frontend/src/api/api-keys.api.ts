import type { ApiKey, CreateApiKeyInput } from '@lede/shared';
import { api } from './client.js';

export type ApiKeySummary = Omit<ApiKey, 'userId'>;
export type CreatedApiKey = Omit<ApiKeySummary, 'lastUsed'> & { key: string };

export const apiKeysApi = {
  list: () => api.get<ApiKeySummary[]>('/auth/api-keys'),
  create: (input: CreateApiKeyInput) => api.post<CreatedApiKey>('/auth/api-keys', input),
  revoke: (id: string) => api.delete<void>(`/auth/api-keys/${encodeURIComponent(id)}`),
};
