import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/index.js';
import { useUiStore } from '../stores/index.js';

export function useFeeds(folderId?: string) {
  return useQuery({
    queryKey: ['feeds', folderId],
    queryFn: () => feedsApi.list({ folderId }),
  });
}

export function useSubscribeFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, folderId, customTitle }: { url: string; folderId?: string; customTitle?: string }) =>
      feedsApi.subscribe(url, folderId, customTitle),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feeds'] }),
  });
}

export function useUpdateFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ feedId, data }: { feedId: string; data: { folderId?: string | null; customTitle?: string | null; refreshInterval?: number } }) =>
      feedsApi.update(feedId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feeds'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}

export function useUnsubscribeFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feedId: string) => feedsApi.unsubscribe(feedId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feeds'] }),
  });
}

export function useRefreshFeed() {
  const qc = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);
  return useMutation({
    mutationFn: (feedId: string) => feedsApi.refresh(feedId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['feeds'] });
      qc.invalidateQueries({ queryKey: ['articles'] });
      qc.invalidateQueries({ queryKey: ['articles-infinite'] });
      const n = data.newArticles;
      addToast(n > 0 ? `${n} new article${n === 1 ? '' : 's'} found` : 'Feed is up to date', 'success');
    },
    onError: () => addToast('Failed to refresh feed', 'error'),
  });
}
