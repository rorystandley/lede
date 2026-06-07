import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotations, useCreateAnnotation, useDeleteAnnotation, useUpdateAnnotation } from './use-annotations.js';
import { useArchiveArticle, useArticle, useArticles, useMarkRead, useMarkUnread, useStarArticle } from './use-articles.js';
import { useArticlesInfinite } from './use-articles-infinite.js';
import { useFeeds, useRefreshFeed, useSubscribeFeed, useUnsubscribeFeed, useUpdateFeed } from './use-feeds.js';
import { useCreateFolder, useDeleteFolder, useFolders } from './use-folders.js';
import { useCreateSavedSearch, useDeleteSavedSearch, useSavedSearches, useUpdateSavedSearch } from './use-saved-searches.js';
import { useSearch } from './use-search.js';
import { useCreateTag, useDeleteTag, useSetArticleTags, useTags } from './use-tags.js';

const {
  searchApi,
  foldersApi,
  tagsApi,
  feedsApi,
  savedSearchesApi,
  annotationsApi,
  articlesApi,
} = vi.hoisted(() => ({
  searchApi: {
    search: vi.fn(),
  },
  foldersApi: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  tagsApi: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    setArticleTags: vi.fn(),
  },
  feedsApi: {
    list: vi.fn(),
    subscribe: vi.fn(),
    update: vi.fn(),
    unsubscribe: vi.fn(),
    refresh: vi.fn(),
  },
  savedSearchesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  annotationsApi: {
    listForArticle: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  articlesApi: {
    list: vi.fn(),
    getById: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    star: vi.fn(),
    archive: vi.fn(),
  },
}));

vi.mock('../api/index.js', () => ({
  annotationsApi,
  articlesApi,
  feedsApi,
  foldersApi,
  savedSearchesApi,
  searchApi,
  tagsApi,
}));

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('React Query hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchApi.search.mockResolvedValue({ items: [] });
    foldersApi.list.mockResolvedValue([]);
    foldersApi.create.mockResolvedValue({ id: 'folder-default' });
    foldersApi.delete.mockResolvedValue(undefined);
    tagsApi.list.mockResolvedValue([]);
    tagsApi.create.mockResolvedValue({ id: 'tag-default' });
    tagsApi.delete.mockResolvedValue(undefined);
    tagsApi.setArticleTags.mockResolvedValue(undefined);
    feedsApi.list.mockResolvedValue([]);
    feedsApi.subscribe.mockResolvedValue({ id: 'feed-default' });
    feedsApi.update.mockResolvedValue({ id: 'feed-default' });
    feedsApi.unsubscribe.mockResolvedValue(undefined);
    feedsApi.refresh.mockResolvedValue({ newArticles: 0 });
    savedSearchesApi.list.mockResolvedValue([]);
    savedSearchesApi.create.mockResolvedValue({ id: 'saved-default' });
    savedSearchesApi.update.mockResolvedValue({ id: 'saved-default' });
    savedSearchesApi.delete.mockResolvedValue(undefined);
    annotationsApi.listForArticle.mockResolvedValue([]);
    annotationsApi.create.mockResolvedValue({ id: 'annotation-default' });
    annotationsApi.update.mockResolvedValue({ id: 'annotation-default' });
    annotationsApi.delete.mockResolvedValue(undefined);
    articlesApi.list.mockResolvedValue({ items: [], hasMore: false });
    articlesApi.getById.mockResolvedValue({ id: 'article-default' });
    articlesApi.markRead.mockResolvedValue(undefined);
    articlesApi.markUnread.mockResolvedValue(undefined);
    articlesApi.star.mockResolvedValue(undefined);
    articlesApi.archive.mockResolvedValue(undefined);
  });

  it('runs useSearch only when enabled and the query is non-empty', async () => {
    const client = createTestClient();
    searchApi.search.mockResolvedValueOnce({ items: ['result'] });

    const { result, rerender } = renderHook(
      ({ query, enabled }) => useSearch(query, enabled),
      {
        initialProps: { query: '', enabled: true },
        wrapper: createWrapper(client),
      },
    );

    expect(searchApi.search).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');

    rerender({ query: 'react query', enabled: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchApi.search).toHaveBeenCalledWith({ q: 'react query' });
    expect(result.current.data).toEqual({ items: ['result'] });
  });

  it('does not run useSearch when the enabled flag is false', () => {
    const client = createTestClient();

    const { result } = renderHook(() => useSearch('react query', false), {
      wrapper: createWrapper(client),
    });

    expect(searchApi.search).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('loads folders and invalidates the folders query after create/delete mutations', async () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    foldersApi.list.mockResolvedValueOnce([{ id: 'folder-1' }]);
    foldersApi.create.mockResolvedValueOnce({ id: 'folder-2' });
    foldersApi.delete.mockResolvedValueOnce(undefined);

    const wrapper = createWrapper(client);
    const foldersHook = renderHook(() => useFolders(), { wrapper });
    const createHook = renderHook(() => useCreateFolder(), { wrapper });
    const deleteHook = renderHook(() => useDeleteFolder(), { wrapper });

    await waitFor(() => expect(foldersHook.result.current.isSuccess).toBe(true));
    expect(foldersApi.list).toHaveBeenCalledWith();
    expect(foldersHook.result.current.data).toEqual([{ id: 'folder-1' }]);

    await act(async () => {
      await createHook.result.current.mutateAsync({ name: 'Tech', parentId: null });
    });

    expect(foldersApi.create).toHaveBeenCalledWith('Tech', null);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['folders'] });

    await act(async () => {
      await deleteHook.result.current.mutateAsync('folder-2');
    });

    expect(foldersApi.delete).toHaveBeenCalledWith('folder-2');
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it('loads tags and invalidates the expected caches for tag mutations', async () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    tagsApi.list.mockResolvedValueOnce([{ id: 'tag-1' }]);
    tagsApi.create.mockResolvedValueOnce({ id: 'tag-2' });
    tagsApi.delete.mockResolvedValueOnce(undefined);
    tagsApi.setArticleTags.mockResolvedValueOnce(undefined);

    const wrapper = createWrapper(client);
    const tagsHook = renderHook(() => useTags(), { wrapper });
    const createHook = renderHook(() => useCreateTag(), { wrapper });
    const deleteHook = renderHook(() => useDeleteTag(), { wrapper });
    const setHook = renderHook(() => useSetArticleTags(), { wrapper });

    await waitFor(() => expect(tagsHook.result.current.isSuccess).toBe(true));
    expect(tagsApi.list).toHaveBeenCalledWith();
    expect(tagsHook.result.current.data).toEqual([{ id: 'tag-1' }]);

    await act(async () => {
      await createHook.result.current.mutateAsync({ name: 'AI', color: '#fff' });
    });
    expect(tagsApi.create).toHaveBeenCalledWith('AI', '#fff');

    await act(async () => {
      await deleteHook.result.current.mutateAsync('tag-2');
    });
    expect(tagsApi.delete).toHaveBeenCalledWith('tag-2');

    await act(async () => {
      await setHook.result.current.mutateAsync({ articleId: 'article-1', tagIds: ['tag-1'] });
    });
    expect(tagsApi.setArticleTags).toHaveBeenCalledWith('article-1', ['tag-1']);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tags'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['articles'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['article'] });
  });

  it('passes folder filters into useFeeds and invalidates feeds/folders/articles for feed mutations', async () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    feedsApi.list.mockResolvedValueOnce([{ id: 'feed-1' }]);
    feedsApi.subscribe.mockResolvedValueOnce({ id: 'feed-2' });
    feedsApi.update.mockResolvedValueOnce({ id: 'feed-1' });
    feedsApi.unsubscribe.mockResolvedValueOnce(undefined);
    feedsApi.refresh.mockResolvedValueOnce({ newArticles: 0 });

    const wrapper = createWrapper(client);
    const feedsHook = renderHook(() => useFeeds('folder-1'), { wrapper });
    const subscribeHook = renderHook(() => useSubscribeFeed(), { wrapper });
    const updateHook = renderHook(() => useUpdateFeed(), { wrapper });
    const unsubscribeHook = renderHook(() => useUnsubscribeFeed(), { wrapper });
    const refreshHook = renderHook(() => useRefreshFeed(), { wrapper });

    await waitFor(() => expect(feedsHook.result.current.isSuccess).toBe(true));
    expect(feedsApi.list).toHaveBeenCalledWith({ folderId: 'folder-1' });
    expect(feedsHook.result.current.data).toEqual([{ id: 'feed-1' }]);

    await act(async () => {
      await subscribeHook.result.current.mutateAsync({
        url: 'https://example.com/rss',
        folderId: 'folder-1',
        customTitle: 'Example',
      });
    });
    expect(feedsApi.subscribe).toHaveBeenCalledWith(
      'https://example.com/rss',
      'folder-1',
      'Example',
    );

    await act(async () => {
      await updateHook.result.current.mutateAsync({
        feedId: 'feed-1',
        data: { folderId: null, customTitle: 'Updated', refreshInterval: 30 },
      });
    });
    expect(feedsApi.update).toHaveBeenCalledWith('feed-1', {
      folderId: null,
      customTitle: 'Updated',
      refreshInterval: 30,
    });

    await act(async () => {
      await unsubscribeHook.result.current.mutateAsync('feed-1');
    });
    expect(feedsApi.unsubscribe).toHaveBeenCalledWith('feed-1');

    await act(async () => {
      await refreshHook.result.current.mutateAsync('feed-1');
    });
    expect(feedsApi.refresh).toHaveBeenCalledWith('feed-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feeds'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['folders'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['articles'] });
  });

  it('loads saved searches and invalidates the saved-searches query after mutations', async () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    savedSearchesApi.list.mockResolvedValueOnce([{ id: 'saved-1' }]);
    savedSearchesApi.create.mockResolvedValueOnce({ id: 'saved-2' });
    savedSearchesApi.update.mockResolvedValueOnce({ id: 'saved-1' });
    savedSearchesApi.delete.mockResolvedValueOnce(undefined);

    const wrapper = createWrapper(client);
    const listHook = renderHook(() => useSavedSearches(), { wrapper });
    const createHook = renderHook(() => useCreateSavedSearch(), { wrapper });
    const updateHook = renderHook(() => useUpdateSavedSearch(), { wrapper });
    const deleteHook = renderHook(() => useDeleteSavedSearch(), { wrapper });

    await waitFor(() => expect(listHook.result.current.isSuccess).toBe(true));
    expect(savedSearchesApi.list).toHaveBeenCalledWith();
    expect(listHook.result.current.data).toEqual([{ id: 'saved-1' }]);

    await act(async () => {
      await createHook.result.current.mutateAsync({ name: 'Unread', query: 'is:unread' });
    });
    expect(savedSearchesApi.create).toHaveBeenCalledWith({
      name: 'Unread',
      query: 'is:unread',
    });

    await act(async () => {
      await updateHook.result.current.mutateAsync({
        id: 'saved-1',
        data: { name: 'Pinned' },
      });
    });
    expect(savedSearchesApi.update).toHaveBeenCalledWith('saved-1', { name: 'Pinned' });

    await act(async () => {
      await deleteHook.result.current.mutateAsync('saved-1');
    });
    expect(savedSearchesApi.delete).toHaveBeenCalledWith('saved-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['saved-searches'] });
  });

  it('gates annotation queries by article id and invalidates article-specific annotation caches', async () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    annotationsApi.listForArticle.mockResolvedValueOnce([{ id: 'annotation-1' }]);
    annotationsApi.create.mockResolvedValueOnce({ id: 'annotation-2' });
    annotationsApi.update.mockResolvedValueOnce({ id: 'annotation-1' });
    annotationsApi.delete.mockResolvedValueOnce(undefined);

    const wrapper = createWrapper(client);
    const disabledQuery = renderHook(() => useAnnotations(null), { wrapper });
    expect(disabledQuery.result.current.fetchStatus).toBe('idle');
    expect(annotationsApi.listForArticle).not.toHaveBeenCalled();

    const listHook = renderHook(() => useAnnotations('article-1'), { wrapper });
    const createHook = renderHook(() => useCreateAnnotation(), { wrapper });
    const updateHook = renderHook(() => useUpdateAnnotation(), { wrapper });
    const deleteHook = renderHook(() => useDeleteAnnotation(), { wrapper });

    await waitFor(() => expect(listHook.result.current.isSuccess).toBe(true));
    expect(annotationsApi.listForArticle).toHaveBeenCalledWith('article-1');
    expect(listHook.result.current.data).toEqual([{ id: 'annotation-1' }]);

    await act(async () => {
      await createHook.result.current.mutateAsync({
        articleId: 'article-1',
        type: 'note',
        content: 'hello',
      });
    });
    expect(annotationsApi.create).toHaveBeenCalledWith({
      articleId: 'article-1',
      type: 'note',
      content: 'hello',
    });

    await act(async () => {
      await updateHook.result.current.mutateAsync({
        annotationId: 'annotation-1',
        articleId: 'article-1',
        data: { content: 'updated', color: '#000' },
      });
    });
    expect(annotationsApi.update).toHaveBeenCalledWith('annotation-1', {
      content: 'updated',
      color: '#000',
    });

    await act(async () => {
      await deleteHook.result.current.mutateAsync({
        annotationId: 'annotation-1',
        articleId: 'article-1',
      });
    });
    expect(annotationsApi.delete).toHaveBeenCalledWith('annotation-1');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['annotations', 'article-1'],
    });
  });

  it('fetches infinite article pages with the expected pagination params', async () => {
    const client = createTestClient();
    articlesApi.list
      .mockResolvedValueOnce({ items: [{ id: 'article-1' }], hasMore: true })
      .mockResolvedValueOnce({ items: [{ id: 'article-2' }], hasMore: false });

    const { result } = renderHook(
      () => useArticlesInfinite({ folderId: 'folder-1', isRead: false }),
      {
        wrapper: createWrapper(client),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(articlesApi.list).toHaveBeenNthCalledWith(1, {
      folderId: 'folder-1',
      isRead: false,
      page: 1,
      pageSize: 30,
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(articlesApi.list).toHaveBeenCalledTimes(2));
    expect(articlesApi.list).toHaveBeenNthCalledWith(2, {
      folderId: 'folder-1',
      isRead: false,
      page: 2,
      pageSize: 30,
    });
  });

  it('loads article lists/details and invalidates caches for article mutations', async () => {
    const client = createTestClient();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    articlesApi.list.mockResolvedValueOnce({ items: [{ id: 'article-1' }], hasMore: false });
    articlesApi.getById.mockResolvedValueOnce({ id: 'article-1', title: 'Story' });

    const wrapper = createWrapper(client);
    const listHook = renderHook(() => useArticles({ feedId: 'feed-1' }), { wrapper });
    const disabledDetailHook = renderHook(() => useArticle(null), { wrapper });
    const detailHook = renderHook(() => useArticle('article-1'), { wrapper });
    const markReadHook = renderHook(() => useMarkRead(), { wrapper });
    const markUnreadHook = renderHook(() => useMarkUnread(), { wrapper });
    const starHook = renderHook(() => useStarArticle(), { wrapper });
    const archiveHook = renderHook(() => useArchiveArticle(), { wrapper });

    expect(disabledDetailHook.result.current.fetchStatus).toBe('idle');
    expect(articlesApi.getById).not.toHaveBeenCalledWith(null);

    await waitFor(() => expect(listHook.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detailHook.result.current.isSuccess).toBe(true));

    expect(articlesApi.list).toHaveBeenCalledWith({ feedId: 'feed-1' });
    expect(articlesApi.getById).toHaveBeenCalledWith('article-1');

    await act(async () => {
      await markReadHook.result.current.mutateAsync(['article-1']);
      await markUnreadHook.result.current.mutateAsync(['article-1']);
      await starHook.result.current.mutateAsync({ articleId: 'article-1', isStarred: true });
      await archiveHook.result.current.mutateAsync({ articleId: 'article-1', isArchived: true });
    });

    expect(articlesApi.markRead).toHaveBeenCalledWith(['article-1']);
    expect(articlesApi.markUnread).toHaveBeenCalledWith(['article-1']);
    expect(articlesApi.star).toHaveBeenCalledWith('article-1', true);
    expect(articlesApi.archive).toHaveBeenCalledWith('article-1', true);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['articles'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feeds'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['article'] });
  });
});
