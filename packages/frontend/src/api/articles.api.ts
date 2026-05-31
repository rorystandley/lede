import { api } from './client.js';
import type { ArticleWithState, PaginatedResult, ListArticlesQuery, SearchArticlesQuery } from '@news-reader/shared';

function toQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) query.set(key, String(val));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export const articlesApi = {
  list: (params?: Partial<ListArticlesQuery>) =>
    api.get<PaginatedResult<ArticleWithState>>(`/articles${toQuery(params ?? {})}`),

  search: (params: Partial<SearchArticlesQuery> & { q: string }) =>
    api.get<PaginatedResult<ArticleWithState>>(`/articles/search${toQuery(params)}`),

  getById: (articleId: string) =>
    api.get<ArticleWithState>(`/articles/${articleId}`),

  markRead: (articleIds: string[]) =>
    api.post('/articles/mark-read', { articleIds }),

  markAllRead: (scope: { feedId?: string; folderId?: string }) =>
    api.post<{ marked: number }>('/articles/mark-all-read', scope),

  markUnread: (articleIds: string[]) =>
    api.post('/articles/mark-unread', { articleIds }),

  star: (articleId: string, isStarred: boolean) =>
    api.patch(`/articles/${articleId}/star`, { isStarred }),

  archive: (articleId: string, isArchived: boolean) =>
    api.patch(`/articles/${articleId}/archive`, { isArchived }),
};
