import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleList } from './ArticleList.js';

const mocks = vi.hoisted(() => ({
  useArticlesInfiniteMock: vi.fn(),
  useSearchMock: vi.fn(),
  useMarkReadMock: vi.fn(),
  useStarArticleMock: vi.fn(),
  useUiStoreMock: vi.fn(),
  useKeyboardNavMock: vi.fn(),
  markAllReadApiMock: vi.fn(),
  refreshAllApiMock: vi.fn(),
  virtualItemsMock: vi.fn(),
}));

vi.mock('../../hooks/use-articles-infinite.js', () => ({
  useArticlesInfinite: (...args: unknown[]) => mocks.useArticlesInfiniteMock(...args),
}));

vi.mock('../../hooks/use-search.js', () => ({
  useSearch: (...args: unknown[]) => mocks.useSearchMock(...args),
}));

vi.mock('../../hooks/use-articles.js', () => ({
  useMarkRead: () => mocks.useMarkReadMock(),
  useStarArticle: () => mocks.useStarArticleMock(),
}));

vi.mock('../../stores/index.js', () => ({
  useUiStore: () => mocks.useUiStoreMock(),
}));

vi.mock('../../hooks/use-keyboard-nav.js', () => ({
  useKeyboardNav: (...args: unknown[]) => mocks.useKeyboardNavMock(...args),
}));

vi.mock('../../api/index.js', () => ({
  articlesApi: {
    markAllRead: mocks.markAllReadApiMock,
  },
  feedsApi: {
    refreshAll: mocks.refreshAllApiMock,
  },
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getScrollElement, estimateSize }: { count: number; getScrollElement: () => unknown; estimateSize: () => number }) => {
    getScrollElement();
    estimateSize();
    return {
      getVirtualItems: () =>
        mocks.virtualItemsMock({ count }) ??
        Array.from({ length: count }, (_, index) => ({
          index,
          start: index * 96,
        })),
      getTotalSize: () => count * 96,
      measureElement: vi.fn(),
    };
  },
}));

vi.mock('./ArticleCard.js', () => ({
  ArticleCard: ({ article, onClick, onStar, isFocused }: { article: { id: string; title: string }; onClick: () => void; onStar: () => void; isFocused: boolean }) => (
    <div data-testid={`card-${article.id}`} data-focused={String(isFocused)}>
      <button type="button" onClick={onClick}>{article.title}</button>
      <button type="button" onClick={onStar}>Star {article.id}</button>
    </div>
  ),
}));

vi.mock('./ArticleMagazineItem.js', () => ({
  ArticleMagazineItem: ({ article, onClick, onStar, isFeatured, isFocused }: { article: { id: string; title: string }; onClick: () => void; onStar: () => void; isFeatured: boolean; isFocused: boolean }) => (
    <div data-testid={`magazine-${article.id}`} data-featured={String(isFeatured)} data-focused={String(isFocused)}>
      <button type="button" onClick={onClick}>{article.title}</button>
      <button type="button" onClick={onStar}>Star magazine {article.id}</button>
    </div>
  ),
}));

vi.mock('./ArticleListItem.js', () => ({
  ArticleListItem: ({ article, onClick, onStar, isFocused, isSelected }: { article: { id: string; title: string }; onClick: () => void; onStar: () => void; isFocused: boolean; isSelected: boolean }) => (
    <div data-testid={`list-item-${article.id}`} data-focused={String(isFocused)} data-selected={String(isSelected)}>
      <button type="button" onClick={onClick}>{article.title}</button>
      <button type="button" onClick={onStar}>Star list {article.id}</button>
    </div>
  ),
}));

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = createClient();
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return {
    client,
    ...render(ui, { wrapper: Wrapper }),
  };
}

function article(overrides: Record<string, unknown> = {}) {
  return {
    id: 'article-1',
    title: 'Article One',
    isRead: false,
    isStarred: false,
    feedTitle: 'Feed',
    summary: 'Summary',
    tags: [],
    publishedAt: '2026-06-05T10:00:00.000Z',
    imageUrl: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function uiState(overrides: Record<string, unknown> = {}) {
  return {
    selectedFeedId: null,
    selectedFolderId: null,
    selectedTagId: null,
    selectedArticleId: null,
    selectArticle: vi.fn(),
    focusedArticleIndex: 0,
    viewMode: 'list',
    searchQuery: '',
    isSearching: false,
    showStarred: false,
    ...overrides,
  };
}

function infiniteState(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items: [article(), article({ id: 'article-2', title: 'Article Two', isRead: true, isStarred: true })] }] },
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}

describe('ArticleList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useUiStoreMock.mockReturnValue(uiState());
    mocks.useArticlesInfiniteMock.mockReturnValue(infiniteState());
    mocks.useSearchMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    mocks.useMarkReadMock.mockReturnValue({ mutate: vi.fn() });
    mocks.useStarArticleMock.mockReturnValue({ mutate: vi.fn() });
    mocks.markAllReadApiMock.mockResolvedValue({ marked: 2 });
    mocks.refreshAllApiMock.mockResolvedValue({ queued: true });
    mocks.useKeyboardNavMock.mockImplementation(() => {});
    mocks.virtualItemsMock.mockImplementation(({ count }: { count: number }) =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 96,
      })),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.useRealTimers();
  });

  it('shows the loading state while infinite articles are loading', () => {
    mocks.useArticlesInfiniteMock.mockReturnValue(
      infiniteState({
        data: undefined,
        isLoading: true,
      }),
    );

    const { container } = renderWithClient(<ArticleList />);

    expect(screen.getByText('0 articles')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows the correct empty state for normal and search views', () => {
    mocks.useArticlesInfiniteMock.mockReturnValue(
      infiniteState({
        data: { pages: [{ items: [] }] },
      }),
    );

    const { rerender } = renderWithClient(<ArticleList />);
    expect(screen.getByText('No articles yet')).toBeInTheDocument();
    expect(screen.getByText('Subscribe to feeds to start reading')).toBeInTheDocument();

    mocks.useUiStoreMock.mockReturnValue(uiState({ isSearching: true, searchQuery: 'ai' }));
    mocks.useSearchMock.mockReturnValue({ data: { items: [] }, isLoading: false });
    rerender(
      <QueryClientProvider client={createClient()}>
        <ArticleList />
      </QueryClientProvider>,
    );

    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.getByText('Try a different search term')).toBeInTheDocument();
  });

  it('handles the card view, toolbar actions, and scroll-driven pagination', async () => {
    const user = userEvent.setup();
    const markReadMutate = vi.fn();
    const starMutate = vi.fn();
    const fetchNextPage = vi.fn();
    const selectArticle = vi.fn();
    mocks.useUiStoreMock.mockReturnValue(uiState({ viewMode: 'card', selectedFeedId: 'feed-1', selectArticle }));
    mocks.useArticlesInfiniteMock.mockReturnValue(
      infiniteState({
        hasNextPage: true,
        fetchNextPage,
      }),
    );
    mocks.useMarkReadMock.mockReturnValue({ mutate: markReadMutate });
    mocks.useStarArticleMock.mockReturnValue({ mutate: starMutate });

    const { client, container } = renderWithClient(<ArticleList />);
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    expect(screen.getByText('2+ articles')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Article One' }));
    expect(selectArticle).toHaveBeenCalledWith('article-1');
    expect(markReadMutate).toHaveBeenCalledWith(['article-1']);

    await user.click(screen.getByRole('button', { name: 'Article Two' }));
    expect(selectArticle).toHaveBeenCalledWith('article-2');

    await user.click(screen.getByRole('button', { name: 'Star article-1' }));
    expect(starMutate).toHaveBeenCalledWith({ articleId: 'article-1', isStarred: true });

    await user.click(screen.getByTitle('Mark all read'));
    await waitFor(() => {
      expect(mocks.markAllReadApiMock).toHaveBeenCalledWith({ feedId: 'feed-1', folderId: undefined });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['articles-infinite'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feeds'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['folders'] });

    await user.click(screen.getByTitle('Refresh all feeds'));
    await waitFor(() => expect(mocks.refreshAllApiMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['articles-infinite'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feeds'] });

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement;
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 500 });
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 900 });
    fireEvent.scroll(scrollContainer);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  }, 8000);

  it('renders magazine view and uses the featured article branch', async () => {
    const user = userEvent.setup();
    const markReadMutate = vi.fn();
    const starMutate = vi.fn();
    const selectArticle = vi.fn();
    mocks.useUiStoreMock.mockReturnValue(uiState({ viewMode: 'magazine', selectArticle, focusedArticleIndex: 1 }));
    mocks.useMarkReadMock.mockReturnValue({ mutate: markReadMutate });
    mocks.useStarArticleMock.mockReturnValue({ mutate: starMutate });

    renderWithClient(<ArticleList />);

    expect(screen.getByTestId('magazine-article-1')).toHaveAttribute('data-featured', 'true');
    expect(screen.getByTestId('magazine-article-2')).toHaveAttribute('data-featured', 'false');

    await user.click(screen.getByRole('button', { name: 'Article One' }));
    expect(selectArticle).toHaveBeenCalledWith('article-1');
    expect(markReadMutate).toHaveBeenCalledWith(['article-1']);

    await user.click(screen.getByRole('button', { name: 'Star magazine article-2' }));
    expect(starMutate).toHaveBeenCalledWith({ articleId: 'article-2', isStarred: false });
  });

  it('renders the virtual list branch and triggers near-end pagination', async () => {
    const user = userEvent.setup();
    const markReadMutate = vi.fn();
    const starMutate = vi.fn();
    const fetchNextPage = vi.fn();
    const selectArticle = vi.fn();
    mocks.useUiStoreMock.mockReturnValue(uiState({ selectedArticleId: 'article-2', selectArticle, focusedArticleIndex: 1 }));
    mocks.useArticlesInfiniteMock.mockReturnValue(
      infiniteState({
        hasNextPage: true,
        fetchNextPage,
      }),
    );
    mocks.useMarkReadMock.mockReturnValue({ mutate: markReadMutate });
    mocks.useStarArticleMock.mockReturnValue({ mutate: starMutate });

    renderWithClient(<ArticleList />);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('list-item-article-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByText('End of feed')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Article One' }));
    expect(selectArticle).toHaveBeenCalledWith('article-1');
    expect(markReadMutate).toHaveBeenCalledWith(['article-1']);

    await user.click(screen.getByRole('button', { name: 'Star list article-1' }));
    expect(starMutate).toHaveBeenCalledWith({ articleId: 'article-1', isStarred: true });

    expect(mocks.useKeyboardNavMock).toHaveBeenCalledWith(
      expect.objectContaining({
        articles: expect.arrayContaining([expect.objectContaining({ id: 'article-1' })]),
      }),
    );
  });

  it('passes combined filter params, uses search results, and handles singular mark-all-read scope', async () => {
    const user = userEvent.setup();
    mocks.useUiStoreMock.mockReturnValue(
      uiState({
        selectedFolderId: 'folder-1',
        selectedTagId: 'tag-1',
        searchQuery: 'ai',
        isSearching: true,
        showStarred: true,
      }),
    );
    mocks.useSearchMock.mockReturnValue({
      data: {
        items: [
          article({
            id: 'search-1',
            title: 'Search Result',
            isRead: true,
          }),
        ],
      },
      isLoading: false,
    });

    renderWithClient(<ArticleList />);

    expect(mocks.useArticlesInfiniteMock).toHaveBeenCalledWith({
      folderId: 'folder-1',
      tagId: 'tag-1',
      isStarred: true,
    });
    expect(screen.getByText('1 article')).toBeInTheDocument();

    await user.click(screen.getByTitle('Mark all read'));
    await waitFor(() => {
      expect(mocks.markAllReadApiMock).toHaveBeenCalledWith({
        feedId: undefined,
        folderId: 'folder-1',
      });
    });
  });

  it('wires keyboard navigation callbacks through to the mutations', () => {
    const markReadMutate = vi.fn();
    const starMutate = vi.fn();
    mocks.useMarkReadMock.mockReturnValue({ mutate: markReadMutate });
    mocks.useStarArticleMock.mockReturnValue({ mutate: starMutate });
    mocks.useKeyboardNavMock.mockImplementation(({ onStar, onMarkRead }) => {
      onStar('article-1', true);
      onMarkRead(['article-1', 'article-2']);
    });

    renderWithClient(<ArticleList />);

    expect(starMutate).toHaveBeenCalledWith({ articleId: 'article-1', isStarred: true });
    expect(markReadMutate).toHaveBeenCalledWith(['article-1', 'article-2']);
  });

  it('renders the load-more spinner while fetching additional pages', () => {
    mocks.useUiStoreMock.mockReturnValue(uiState({ viewMode: 'card' }));
    mocks.useArticlesInfiniteMock.mockReturnValue(
      infiniteState({
        hasNextPage: true,
        isFetchingNextPage: true,
      }),
    );

    const { container } = renderWithClient(<ArticleList />);

    const spinners = container.querySelectorAll('.animate-spin');
    expect(spinners.length).toBeGreaterThan(0);
    expect(screen.queryByText('End of feed')).not.toBeInTheDocument();
  });

  it('falls back to empty search data and empty virtual items without crashing', () => {
    mocks.useUiStoreMock.mockReturnValue(uiState({ isSearching: true, searchQuery: 'ai' }));
    mocks.useSearchMock.mockReturnValue({ data: undefined, isLoading: false });

    const firstView = renderWithClient(<ArticleList />);
    expect(screen.getByText('No results found')).toBeInTheDocument();

    firstView.unmount();

    mocks.useUiStoreMock.mockReturnValue(uiState({ viewMode: 'list' }));
    mocks.virtualItemsMock.mockReturnValue([]);

    renderWithClient(<ArticleList />);

    expect(screen.getByText('End of feed')).toBeInTheDocument();
    expect(screen.queryByTestId('list-item-article-1')).not.toBeInTheDocument();
  });

  it('shows the refresh spinner while refresh-all is pending', async () => {
    const pendingRefresh = deferred<{ queued: boolean }>();
    mocks.refreshAllApiMock.mockReturnValueOnce(pendingRefresh.promise);

    renderWithClient(<ArticleList />);

    fireEvent.click(screen.getByTitle('Refresh all feeds'));
    await waitFor(() => {
      expect(screen.getByTitle('Refresh all feeds').querySelector('.animate-spin')).toBeTruthy();
    });

    await act(async () => {
      pendingRefresh.resolve({ queued: true });
      await pendingRefresh.promise;
    });
  });
});
