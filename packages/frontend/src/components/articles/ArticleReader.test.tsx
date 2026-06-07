import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleReader } from './ArticleReader.js';

const mocks = vi.hoisted(() => ({
  useArticleMock: vi.fn(),
  useUiStoreMock: vi.fn(),
  markReadMutate: vi.fn(),
  starMutate: vi.fn(),
  summarizeMock: vi.fn(),
  suggestTagsMock: vi.fn(),
  extractMock: vi.fn(),
  getShareDataMock: vi.fn(),
  applyByNameMock: vi.fn(),
}));

vi.mock('../../hooks/use-articles.js', () => ({
  useArticle: (...args: unknown[]) => mocks.useArticleMock(...args),
  useMarkRead: () => ({ mutate: mocks.markReadMutate }),
  useStarArticle: () => ({ mutate: mocks.starMutate }),
}));

vi.mock('../../stores/index.js', () => ({
  useUiStore: () => mocks.useUiStoreMock(),
}));

vi.mock('../../api/index.js', () => ({
  aiApi: {
    summarize: (...args: unknown[]) => mocks.summarizeMock(...args),
    suggestTags: (...args: unknown[]) => mocks.suggestTagsMock(...args),
  },
  articlesApi: {
    extract: (...args: unknown[]) => mocks.extractMock(...args),
  },
  sharingApi: {
    getShareData: (...args: unknown[]) => mocks.getShareDataMock(...args),
  },
}));

vi.mock('../../api/tags.api.js', () => ({
  tagsApi: {
    applyByName: (...args: unknown[]) => mocks.applyByNameMock(...args),
  },
}));

vi.mock('../shared/ArticlePlaceholder.js', () => ({
  ArticlePlaceholder: ({ size, seed }: { size: string; seed: string }) => (
    <div data-testid="article-placeholder">{size}:{seed}</div>
  ),
}));

vi.mock('./AnnotatedContent.js', () => ({
  AnnotatedContent: ({ articleId, html }: { articleId: string; html: string }) => (
    <div data-testid="annotated-content" data-article-id={articleId}>
      {html}
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

function renderReader() {
  const client = createClient();
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ArticleReader />
      </QueryClientProvider>,
    ),
  };
}

function buildArticle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'article-1',
    url: 'https://example.com/posts/1',
    feedTitle: 'Example Feed',
    title: 'Example Article',
    summary: '<p>Summary</p>',
    contentHtml: `<p>${'content '.repeat(200)}</p>`,
    contentText: 'content '.repeat(200),
    isRead: false,
    isStarred: false,
    author: 'Ada Lovelace',
    publishedAt: '2026-06-06T10:00:00.000Z',
    wordCount: 600,
    imageUrl: 'https://cdn.example.com/image.jpg?w=320&h=200&q=75',
    tags: [] as Array<{ id: string; name: string; color: string | null }>,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useUiStoreMock.mockReturnValue({
    selectedArticleId: 'article-1',
    selectArticle: vi.fn(),
  });
  mocks.useArticleMock.mockReturnValue({
    data: buildArticle(),
    isLoading: false,
  });
  mocks.summarizeMock.mockResolvedValue({ summary: 'Short AI summary' });
  mocks.suggestTagsMock.mockResolvedValue({ tags: ['ai'] });
  mocks.extractMock.mockResolvedValue({ extractionStatus: 'full' });
  mocks.getShareDataMock.mockResolvedValue({
    title: 'Example Article',
    summary: 'Shared summary',
    shareUrl: 'https://share.example.com/article-1',
  });
  mocks.applyByNameMock.mockResolvedValue([{ id: 'tag-ai', name: 'ai', color: null }]);

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ArticleReader', () => {
  it('renders empty, loading, and missing article states', () => {
    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: null,
      selectArticle: vi.fn(),
    });

    const { rerender, container } = renderReader();
    expect(screen.getByText('Select an article to read')).toBeInTheDocument();

    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: 'article-1',
      selectArticle: vi.fn(),
    });
    mocks.useArticleMock.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    rerender(
      <QueryClientProvider client={createClient()}>
        <ArticleReader />
      </QueryClientProvider>,
    );
    expect(container.querySelector('.animate-spin')).toBeTruthy();

    mocks.useArticleMock.mockReturnValue({
      data: null,
      isLoading: false,
    });
    rerender(
      <QueryClientProvider client={createClient()}>
        <ArticleReader />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Article not found')).toBeInTheDocument();
  });

  it('renders article actions, shares, summarizes, suggests tags, and applies a tag', async () => {
    const selectArticle = vi.fn();
    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: 'article-1',
      selectArticle,
    });

    renderReader();

    expect(screen.getByText('Example Feed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Example Article' })).toBeInTheDocument();
    expect(screen.getByText('By Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('3 min read')).toBeInTheDocument();
    expect(screen.getByTestId('annotated-content')).toHaveAttribute('data-article-id', 'article-1');
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/image.jpg');
    expect(mocks.markReadMutate).toHaveBeenCalledWith(['article-1']);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(selectArticle).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole('button', { name: 'Star' }));
    expect(mocks.starMutate).toHaveBeenCalledWith({ articleId: 'article-1', isStarred: true });

    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    await waitFor(() => {
      expect(mocks.getShareDataMock).toHaveBeenCalledWith('article-1');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://share.example.com/article-1');
    });
    expect(screen.getByRole('button', { name: 'Link copied!' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }));
    await screen.findByText('AI Summary');
    expect(screen.getByText('Short AI summary')).toBeInTheDocument();
    expect(mocks.summarizeMock).toHaveBeenCalledWith('article-1');

    fireEvent.click(screen.getByRole('button', { name: 'Suggest Tags' }));
    const aiTagButton = await screen.findByRole('button', { name: 'ai' });
    fireEvent.click(aiTagButton);

    await waitFor(() => {
      expect(mocks.applyByNameMock).toHaveBeenCalledWith('article-1', ['ai'], 'ai');
    });
    expect(screen.getByText('Applied tags appear in the sidebar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ai' })).toBeDisabled();
  });

  it('shows fetch error state for thin content and supports dismissing the banner', async () => {
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        contentHtml: '<div>tiny</div>',
        contentText: 'tiny',
        imageUrl: null,
      }),
      isLoading: false,
    });
    mocks.extractMock.mockRejectedValue(new Error('blocked'));

    renderReader();

    expect(screen.getByTestId('article-placeholder')).toHaveTextContent('hero:article-1');
    await waitFor(() => expect(mocks.extractMock).toHaveBeenCalledWith('article-1'));
    await waitFor(
      () => {
        expect(screen.getByText(/Couldn't fetch from example.com/)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Couldn't fetch from example.com/)).not.toBeInTheDocument();
  });

  it('shows metadata-only extraction results and handles share aborts without surfacing an error', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
    });

    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        title: null,
        contentHtml: '<div>tiny</div>',
        contentText: 'tiny',
        tags: [{ id: 'tag-1', name: 'Existing', color: '#00ff00' }],
      }),
      isLoading: false,
    });
    mocks.extractMock.mockResolvedValue({ extractionStatus: 'metadata' });

    renderReader();

    expect(screen.getByRole('heading', { name: 'Untitled' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.extractMock).toHaveBeenCalledWith('article-1'));
    await waitFor(
      () => {
        expect(screen.getByText(/couldn't pull the full article/i)).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    const openOriginalLinks = screen.getAllByRole('link', { name: 'Open original' });
    expect(openOriginalLinks[1]).toHaveAttribute('href', 'https://example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    await waitFor(() => expect(mocks.getShareDataMock).toHaveBeenCalledWith('article-1'));
    expect(screen.getByRole('button', { name: 'Share article' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share failed' })).not.toBeInTheDocument();
  });

  it('shows share, summarize, and tag suggestion error states and allows dismissing them', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('share failed')),
    });

    mocks.getShareDataMock.mockResolvedValue({
      title: 'Example Article',
      summary: null,
      shareUrl: 'https://share.example.com/article-1',
    });
    mocks.summarizeMock.mockRejectedValue(new Error('missing config'));
    mocks.suggestTagsMock.mockRejectedValueOnce(new Error('upstream boom'));

    const view = renderReader();

    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    await waitFor(() => expect(mocks.getShareDataMock).toHaveBeenCalledWith('article-1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share failed' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }));
    expect(await screen.findByText(/AI summarization unavailable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/AI summarization unavailable/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest Tags' }));
    expect(await screen.findByText(/AI request failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/AI request failed/i)).not.toBeInTheDocument();

    view.unmount();

    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: 'article-2',
      selectArticle: vi.fn(),
    });
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({ id: 'article-2' }),
      isLoading: false,
    });
    mocks.suggestTagsMock.mockRejectedValueOnce(new Error('400 not configured'));

    renderReader();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest Tags' }));
    expect(await screen.findByText(/AI not configured/i)).toBeInTheDocument();
  });

  it('shows manual fetch loading and error states, then surfaces empty tag suggestions', async () => {
    const pendingExtract = deferred<{ extractionStatus?: 'full' | 'metadata' }>();
    mocks.extractMock.mockReturnValueOnce(pendingExtract.promise).mockResolvedValueOnce({ extractionStatus: 'full' });
    mocks.suggestTagsMock.mockResolvedValue({ tags: [] });
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        url: 'not a valid url',
        contentHtml: `<p>${'content '.repeat(120)}</p><img src="not a valid url" srcset="x 1x" sizes="100vw">`,
        contentText: 'This body is long enough to avoid auto extract '.repeat(30),
        summary: '<p>Fallback summary</p>',
        isStarred: true,
        tags: [{ id: 'tag-1', name: 'AI', color: null }],
      }),
      isLoading: false,
    });

    renderReader();

    expect(screen.getByRole('button', { name: 'Unstar' })).toBeInTheDocument();
    expect(screen.getByTestId('annotated-content')).toHaveTextContent('https://example.com/not%20a%20valid%20url');
    expect(screen.getByTestId('annotated-content')).not.toHaveTextContent('srcset=');

    fireEvent.click(screen.getAllByRole('button', { name: 'Fetch' })[0]);
    expect(await screen.findByRole('button', { name: 'Fetching...' })).toBeInTheDocument();
    expect(screen.getByText(/Fetching full article from the source/i)).toBeInTheDocument();

    await act(async () => {
      pendingExtract.reject(new Error('blocked'));
      await pendingExtract.promise.catch(() => undefined);
    });
    await waitFor(() => {
      expect(screen.getByText(/Couldn't fetch from the source/i)).toBeInTheDocument();
    }, { timeout: 2000 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    await waitFor(() => {
      expect(mocks.extractMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Suggest Tags' }));
    expect(await screen.findByText(/No tag suggestions for this article/i)).toBeInTheDocument();
  });

  it('shows the pending apply-tag spinner and preserves malformed lead image urls', async () => {
    const pendingApply = deferred<Array<{ id: string; name: string; color: string | null }>>();
    mocks.suggestTagsMock.mockResolvedValue({ tags: ['fresh-tag'] });
    mocks.applyByNameMock.mockReturnValueOnce(pendingApply.promise);
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        imageUrl: 'https://[::1',
      }),
      isLoading: false,
    });

    renderReader();

    expect(document.querySelector('img')).toHaveAttribute('src', 'https://[::1');

    fireEvent.click(screen.getByRole('button', { name: 'Suggest Tags' }));
    const suggested = await screen.findByRole('button', { name: 'fresh-tag' });
    fireEvent.click(suggested);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'fresh-tag' }).querySelector('.animate-spin')).toBeTruthy();
    });

    await act(async () => {
      pendingApply.resolve([{ id: 'tag-fresh', name: 'fresh-tag', color: null }]);
      await pendingApply.promise;
    });
  });

  it('reports repeated extraction failures with the retry attempt count', async () => {
    mocks.extractMock.mockRejectedValue(new Error('blocked again'));
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        url: 'https://retry.example.com/story',
        contentHtml: `<p>${'content '.repeat(120)}</p>`,
        contentText: 'This body is long enough to avoid auto extract '.repeat(30),
      }),
      isLoading: false,
    });

    renderReader();

    fireEvent.click(screen.getByRole('button', { name: 'Fetch' }));
    await waitFor(() => {
      expect(screen.getByText(/Couldn't fetch from retry.example.com/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(screen.getByText(/Attempt 2 failed/i)).toBeInTheDocument();
    });
  }, 8000);

  it('covers no-url rendering, pending summarize state, and the idle extraction banner dismissal', async () => {
    const pendingSummary = deferred<{ summary: string }>();
    mocks.summarizeMock.mockReturnValueOnce(pendingSummary.promise);
    mocks.extractMock.mockResolvedValue({});
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        url: null,
        contentHtml: null,
        summary: null,
      }),
      isLoading: false,
    });

    const firstView = renderReader();

    expect(screen.queryByRole('button', { name: 'Fetch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open original' })).not.toBeInTheDocument();
    expect(screen.getByTestId('annotated-content')).toHaveTextContent('');

    fireEvent.click(screen.getByRole('button', { name: 'Summarize' }));
    expect(await screen.findByRole('button', { name: '...' })).toBeInTheDocument();

    await act(async () => {
      pendingSummary.resolve({ summary: 'Deferred summary' });
      await pendingSummary.promise;
    });
    expect(await screen.findByText('Deferred summary')).toBeInTheDocument();

    firstView.unmount();

    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        url: 'https://idle.example.com/story',
        contentHtml: '<div>tiny</div>',
        contentText: 'tiny',
      }),
      isLoading: false,
    });

    renderReader();
    await waitFor(() => expect(mocks.extractMock).toHaveBeenCalledWith('article-1'));
    await waitFor(() => {
      expect(screen.getByText(/Want to fetch the full article from/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Want to fetch the full article from/i)).not.toBeInTheDocument();
  });

  it('covers share-without-summary, article-url thin-content detection, and metadata dismissals', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    mocks.getShareDataMock.mockResolvedValue({
      title: 'Example Article',
      summary: null,
      shareUrl: 'https://share.example.com/article-1',
    });
    mocks.extractMock.mockResolvedValue({ extractionStatus: 'metadata' });
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        contentHtml: '<p>fallback</p>',
        contentText: `Article URL: https://example.com/story\n${'x'.repeat(900)}`,
      }),
      isLoading: false,
    });

    renderReader();

    await waitFor(() => expect(mocks.extractMock).toHaveBeenCalledWith('article-1'));
    await waitFor(() => {
      expect(screen.getByText(/couldn't pull the full article/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Share article' }));
    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalledWith({
        title: 'Example Article',
        text: undefined,
        url: 'https://share.example.com/article-1',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/couldn't pull the full article/i)).not.toBeInTheDocument();
  });

  it('covers additional thin-content branches and avoids re-auto-extracting the same article id', async () => {
    const selectArticle = vi.fn();
    const firstArticle = buildArticle({
      contentHtml: '<p>fallback</p>',
      contentText: `Comments URL: https://example.com/story/comments\n${'x'.repeat(900)}`,
    });

    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: 'article-1',
      selectArticle,
    });
    mocks.useArticleMock.mockReturnValue({
      data: firstArticle,
      isLoading: false,
    });

    const view = renderReader();

    await waitFor(() => {
      expect(mocks.extractMock).toHaveBeenCalledTimes(1);
    });
    expect(mocks.extractMock).toHaveBeenLastCalledWith('article-1');

    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: null,
      selectArticle,
    });
    mocks.useArticleMock.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    view.rerender(
      <QueryClientProvider client={view.client}>
        <ArticleReader />
      </QueryClientProvider>,
    );

    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: 'article-1',
      selectArticle,
    });
    mocks.useArticleMock.mockReturnValue({
      data: firstArticle,
      isLoading: false,
    });
    view.rerender(
      <QueryClientProvider client={view.client}>
        <ArticleReader />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Example Article' })).toBeInTheDocument();
    });
    expect(mocks.extractMock).toHaveBeenCalledTimes(1);

    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: 'article-2',
      selectArticle,
    });
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        id: 'article-2',
        contentHtml: '<div>tiny markup only</div>',
        contentText: 'Long body '.repeat(120),
      }),
      isLoading: false,
    });
    view.rerender(
      <QueryClientProvider client={view.client}>
        <ArticleReader />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.extractMock).toHaveBeenCalledWith('article-2');
    });

    mocks.useUiStoreMock.mockReturnValue({
      selectedArticleId: 'article-3',
      selectArticle,
    });
    mocks.useArticleMock.mockReturnValue({
      data: buildArticle({
        id: 'article-3',
        contentHtml: '<p>summary fallback</p>',
        contentText: null,
      }),
      isLoading: false,
    });
    view.rerender(
      <QueryClientProvider client={view.client}>
        <ArticleReader />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.extractMock).toHaveBeenCalledWith('article-3');
    });
  });

  it('falls back to the generic tag error when the AI error message is empty', async () => {
    mocks.suggestTagsMock.mockRejectedValueOnce(new Error(''));

    renderReader();

    fireEvent.click(screen.getByRole('button', { name: 'Suggest Tags' }));
    expect(await screen.findByText(/AI request failed/i)).toBeInTheDocument();
  });
});
