import { useInfiniteQuery } from '@tanstack/react-query';
import { articlesApi } from '../api/index.js';
import type { ListArticlesQuery } from '@lede/shared';

export function useArticlesInfinite(params?: Omit<Partial<ListArticlesQuery>, 'page'>) {
  return useInfiniteQuery({
    queryKey: ['articles-infinite', params],
    queryFn: ({ pageParam = 1 }) => articlesApi.list({ ...params, page: pageParam, pageSize: 30 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length + 1 : undefined),
  });
}
