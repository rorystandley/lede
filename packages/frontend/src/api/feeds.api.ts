import { api } from './client.js';
import type { SubscribedFeed, PaginatedResult } from '@news-reader/shared';

export const feedsApi = {
  list: (params?: { folderId?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.folderId) query.set('folderId', params.folderId);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return api.get<PaginatedResult<SubscribedFeed>>(`/feeds${qs ? `?${qs}` : ''}`);
  },

  subscribe: (url: string, folderId?: string, customTitle?: string) =>
    api.post<{ feed: SubscribedFeed }>('/feeds', { url, folderId, customTitle }),

  unsubscribe: (feedId: string) =>
    api.delete(`/feeds/${feedId}`),

  refresh: (feedId: string) =>
    api.post<{ newArticles: number }>(`/feeds/${feedId}/refresh`),
};
