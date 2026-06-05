import { api } from './client.js';
import type { SavedSearch, CreateSavedSearchInput, UpdateSavedSearchInput } from '@news-reader/shared';

export const savedSearchesApi = {
  list: () => api.get<SavedSearch[]>('/search/saved'),

  create: (data: CreateSavedSearchInput) =>
    api.post<SavedSearch>('/search/saved', data),

  update: (id: string, data: UpdateSavedSearchInput) =>
    api.put<SavedSearch>(`/search/saved/${id}`, data),

  delete: (id: string) =>
    api.delete(`/search/saved/${id}`),
};
