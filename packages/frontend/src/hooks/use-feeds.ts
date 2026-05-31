import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/index.js';

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
    mutationFn: ({ feedId, data }: { feedId: string; data: { folderId?: string | null; customTitle?: string | null } }) =>
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
  return useMutation({
    mutationFn: (feedId: string) => feedsApi.refresh(feedId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feeds'] });
      qc.invalidateQueries({ queryKey: ['articles'] });
    },
  });
}
