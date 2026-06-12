import { useInfiniteQuery } from '@tanstack/react-query';
import { articlesApi } from '../api/index.js';
import type { ListArticlesQuery } from '@lede/shared';

const POLL_INTERVAL = 5 * 60 * 1000;

export function useArticlesInfinite(params?: Omit<Partial<ListArticlesQuery>, 'page'>) {
  return useInfiniteQuery({
    queryKey: ['articles-infinite', params],
    queryFn: async ({ pageParam = 1 }) => {
      const isPolling = pageParam === 1;
      if (isPolling) {
        console.log('[sync] polling articles…', { params, time: new Date().toLocaleTimeString() });
      }
      const result = await articlesApi.list({ ...params, page: pageParam, pageSize: 30 });
      if (isPolling) {
        console.log('[sync] articles response', { total: result.total, fetched: result.items.length, hasMore: result.hasMore });
      }
      return result;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
    refetchInterval: POLL_INTERVAL,
  });
}
