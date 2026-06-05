import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { savedSearchesApi } from '../api/index.js';
import type { CreateSavedSearchInput, UpdateSavedSearchInput } from '@news-reader/shared';

export function useSavedSearches() {
  return useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => savedSearchesApi.list(),
  });
}

export function useCreateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateSavedSearchInput) =>
      savedSearchesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
}

export function useUpdateSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSavedSearchInput }) =>
      savedSearchesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
}

export function useDeleteSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => savedSearchesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
}
