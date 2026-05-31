import { useQuery } from '@tanstack/react-query';
import { searchApi } from '../api/index.js';

export function useSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => searchApi.search({ q: query }),
    enabled: enabled && query.length > 0,
  });
}
