import { api } from './client.js';
import type { ArticleWithState, PaginatedResult } from '@news-reader/shared';

function toQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) query.set(key, String(val));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export const searchApi = {
  search: (params: { q: string; feedId?: string; folderId?: string; tagId?: string; page?: number; pageSize?: number }) =>
    api.get<PaginatedResult<ArticleWithState>>(`/search${toQuery(params)}`),
};
