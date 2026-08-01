import { api } from './client.js';
import type { FolderWithCounts, Folder } from '@lede/shared';

export const foldersApi = {
  list: () => api.get<FolderWithCounts[]>('/folders'),

  create: (name: string, parentId?: string | null) =>
    api.post<Folder>('/folders', { name, parentId }),

  update: (folderId: string, data: { name?: string; parentId?: string | null; sortOrder?: number }) =>
    api.patch<Folder>(`/folders/${folderId}`, data),

  delete: (folderId: string) =>
    api.delete(`/folders/${folderId}`),
};
