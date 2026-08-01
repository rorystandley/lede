import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tagsApi } from '../api/index.js';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list(),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      tagsApi.create(name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => tagsApi.delete(tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

export function useSetArticleTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, tagIds }: { articleId: string; tagIds: string[] }) =>
      tagsApi.setArticleTags(articleId, tagIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] });
      qc.invalidateQueries({ queryKey: ['article'] });
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}
