import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { foldersApi } from '../api/index.js';

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: () => foldersApi.list(),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
      foldersApi.create(name, parentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) => foldersApi.delete(folderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}
