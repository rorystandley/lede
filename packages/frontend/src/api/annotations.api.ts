import { api } from './client.js';

export interface Annotation {
  id: string;
  userId: string;
  articleId: string;
  type: 'highlight' | 'note';
  content: string | null;
  startOffset: number | null;
  endOffset: number | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export const annotationsApi = {
  listForArticle: (articleId: string) =>
    api.get<Annotation[]>(`/annotations/articles/${articleId}`),

  create: (data: {
    articleId: string;
    type: 'highlight' | 'note';
    content?: string;
    startOffset?: number;
    endOffset?: number;
    color?: string;
  }) => api.post<Annotation>('/annotations', data),

  update: (annotationId: string, data: { content?: string; color?: string }) =>
    api.patch<Annotation>(`/annotations/${annotationId}`, data),

  delete: (annotationId: string) =>
    api.delete(`/annotations/${annotationId}`),
};
