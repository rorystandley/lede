import { api } from './client.js';
import type { Tag, TagWithCount } from '@news-reader/shared';

export const tagsApi = {
  list: () => api.get<TagWithCount[]>('/tags'),

  create: (name: string, color?: string) =>
    api.post<Tag>('/tags', { name, color }),

  update: (tagId: string, data: { name?: string; color?: string | null }) =>
    api.patch<Tag>(`/tags/${tagId}`, data),

  delete: (tagId: string) =>
    api.delete(`/tags/${tagId}`),

  setArticleTags: (articleId: string, tagIds: string[]) =>
    api.put(`/tags/articles/${articleId}`, { tagIds }),
};
