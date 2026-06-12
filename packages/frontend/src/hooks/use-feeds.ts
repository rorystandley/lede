import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedsApi } from '../api/index.js';
import { useUiStore } from '../stores/index.js';

const POLL_INTERVAL = 5 * 60 * 1000;

let _refreshingStale = false;

export function useFeeds(folderId?: string) {
  const qc = useQueryClient();

  return useQuery({
    queryKey: ['feeds', folderId],
    queryFn: async () => {
      console.log('[sync] polling feeds…', { folderId, time: new Date().toLocaleTimeString() });
      const result = await feedsApi.list({ folderId });
      const items = result.items ?? [];
      const totalUnread = items.reduce((sum: number, f: { unreadCount: number }) => sum + (f.unreadCount ?? 0), 0);
      console.log('[sync] feeds response', { count: items.length, totalUnread });

      feedsApi.syncStatus().then((s) => {
        const staleFeeds = s.feeds.filter((f) => f.isStale);
        console.log('[sync] backend status', {
          uptime: `${Math.floor(s.uptime / 60)}m`,
          queue: s.queue,
          staleFeeds: staleFeeds.length,
          feeds: s.feeds.map((f) => `${f.title} | fetched: ${f.lastFetchedAt ?? 'never'} | stale: ${f.isStale} | error: ${f.lastError ?? 'none'}`),
        });

        if (staleFeeds.length > 0 && !_refreshingStale) {
          _refreshingStale = true;
          console.log('[sync] stale feeds detected, triggering refresh-all…');
          feedsApi.refreshAll().then(() => {
            console.log('[sync] refresh-all queued, will refetch in 5s');
            setTimeout(() => {
              qc.invalidateQueries({ queryKey: ['articles-infinite'] });
              qc.invalidateQueries({ queryKey: ['feeds'] });
              _refreshingStale = false;
              console.log('[sync] queries invalidated after stale-feed refresh');
            }, 5000);
          }).catch((err) => {
            console.error('[sync] refresh-all failed', err);
            _refreshingStale = false;
          });
        }
      }).catch(() => {});

      return result;
    },
    refetchInterval: POLL_INTERVAL,
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
