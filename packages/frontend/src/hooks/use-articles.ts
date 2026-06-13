import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { articlesApi } from '../api/index.js';
import type { ListArticlesQuery } from '@lede/shared';

export function useArticles(params?: Partial<ListArticlesQuery>) {
  return useQuery({
    queryKey: ['articles', params],
    queryFn: () => articlesApi.list(params),
  });
}

export function useArticle(articleId: string | null) {
  return useQuery({
    queryKey: ['article', articleId],
    queryFn: () => articlesApi.getById(articleId!),
    enabled: !!articleId,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (articleIds: string[]) => articlesApi.markRead(articleIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] });
      // Refresh the infinite list so read articles drop out of the unread-only
      // News Feed once the reader is closed.
      qc.invalidateQueries({ queryKey: ['articles-infinite'] });
      qc.invalidateQueries({ queryKey: ['feeds'] });
    },
  });
}

export function useMarkUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (articleIds: string[]) => articlesApi.markUnread(articleIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] });
      qc.invalidateQueries({ queryKey: ['feeds'] });
    },
  });
}

export function useStarArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, isStarred }: { articleId: string; isStarred: boolean }) =>
      articlesApi.star(articleId, isStarred),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] });
      qc.invalidateQueries({ queryKey: ['article'] });
    },
  });
}

export function useArchiveArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, isArchived }: { articleId: string; isArchived: boolean }) =>
      articlesApi.archive(articleId, isArchived),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] });
      qc.invalidateQueries({ queryKey: ['article'] });
    },
  });
}
