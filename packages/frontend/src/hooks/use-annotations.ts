import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { annotationsApi } from '../api/index.js';

export function useAnnotations(articleId: string | null) {
  return useQuery({
    queryKey: ['annotations', articleId],
    queryFn: () => annotationsApi.listForArticle(articleId!),
    enabled: !!articleId,
  });
}

export function useCreateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      articleId: string;
      type: 'highlight' | 'note';
      content?: string;
      startOffset?: number;
      endOffset?: number;
      color?: string;
    }) => annotationsApi.create(data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['annotations', vars.articleId] });
    },
  });
}

export function useUpdateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      annotationId,
      articleId,
      data,
    }: {
      annotationId: string;
      articleId: string;
      data: { content?: string; color?: string };
    }) => annotationsApi.update(annotationId, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['annotations', vars.articleId] });
    },
  });
}

export function useDeleteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      annotationId,
      articleId,
    }: {
      annotationId: string;
      articleId: string;
    }) => annotationsApi.delete(annotationId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['annotations', vars.articleId] });
    },
  });
}
