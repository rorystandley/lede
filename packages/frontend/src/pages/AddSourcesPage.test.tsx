import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddSourcesPage } from './AddSourcesPage.js';

const {
  discoverApi,
  feedsApi,
  useFoldersMock,
} = vi.hoisted(() => ({
  discoverApi: {
    directory: vi.fn(),
    discover: vi.fn(),
  },
  feedsApi: {
    subscribe: vi.fn(),
  },
  useFoldersMock: vi.fn(),
}));

vi.mock('../api/discover.api.js', () => ({
  discoverApi,
}));

vi.mock('../api/index.js', () => ({
  feedsApi,
}));

vi.mock('../hooks/use-folders.js', () => ({
  useFolders: () => useFoldersMock(),
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

function renderPage(onClose = vi.fn()) {
  const client = createTestClient();

  return render(
    <QueryClientProvider client={client}>
      <AddSourcesPage onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe('AddSourcesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFoldersMock.mockReturnValue({ data: [] });
    discoverApi.directory.mockResolvedValue({
      categories: [],
      feeds: [],
    });
    discoverApi.discover.mockResolvedValue({
      query: 'https://example.com/feed.xml',
      feeds: [
        {
          url: 'https://example.com/feed.xml',
          title: 'Example Feed',
          description: null,
          siteUrl: 'https://example.com',
          feedType: 'rss',
          itemCount: 10,
        },
      ],
    });
    feedsApi.subscribe.mockResolvedValue({ id: 'feed-1' });
  });

  it('filters browse results by search and category, shows empty states, and subscribes into the selected folder', async () => {
    const categories = ['Technology', 'Culture'];
    const feeds = [
      {
        name: 'Tech Daily',
        url: 'https://tech.example/rss',
        siteUrl: 'https://tech.example',
        description: 'Daily tech coverage',
        category: 'Technology',
        isSubscribed: false,
      },
      {
        name: 'Science Weekly',
        url: 'https://science.example/rss',
        siteUrl: 'https://science.example',
        description: 'Science and research',
        category: 'Technology',
        isSubscribed: false,
      },
    ];

    useFoldersMock.mockReturnValue({
      data: [
        {
          id: 'folder-1',
          name: 'Favorites',
          children: [],
          articleCount: 0,
          unreadCount: 0,
          feedCount: 0,
        },
      ],
    });

    discoverApi.directory.mockImplementation(async (params?: { category?: string; q?: string }) => ({
      categories,
      feeds: feeds.filter((feed) => {
        const matchesCategory = !params?.category || feed.category === params.category;
        const query = params?.q?.toLowerCase() ?? '';
        const matchesQuery = !query || `${feed.name} ${feed.description}`.toLowerCase().includes(query);
        return matchesCategory && matchesQuery;
      }),
    }));

    renderPage();

    expect(await screen.findByText('Tech Daily')).toBeInTheDocument();
    expect(screen.getByText('Science Weekly')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'folder-1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0]);

    await waitFor(() => {
      expect(feedsApi.subscribe).toHaveBeenCalledWith('https://tech.example/rss', 'folder-1');
    });

    fireEvent.change(screen.getByPlaceholderText('Search sources...'), { target: { value: 'science' } });
    expect(await screen.findByText('Science Weekly')).toBeInTheDocument();
    expect(screen.queryByText('Tech Daily')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search sources...'), { target: { value: 'missing source' } });
    expect(await screen.findByText('No sources match your search')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search sources...'), { target: { value: '' } });
    expect(await screen.findByText('Tech Daily')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Culture' }));
    expect(await screen.findByText('No sources in this category')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(await screen.findByText('Tech Daily')).toBeInTheDocument();

    expect(discoverApi.directory).toHaveBeenCalledWith(expect.objectContaining({ q: 'science' }));
    expect(discoverApi.directory).toHaveBeenCalledWith(expect.objectContaining({ category: 'Culture' }));
  });

  it('switches tabs, discovers a valid feed from Enter, and shows subscribe success', async () => {
    useFoldersMock.mockReturnValue({
      data: [
        {
          id: 'folder-2',
          name: 'Podcasts',
          children: [],
          articleCount: 0,
          unreadCount: 0,
          feedCount: 0,
        },
      ],
    });

    discoverApi.discover.mockResolvedValue({
      query: 'https://example.com/feed.xml',
      feeds: [
        {
          url: 'https://example.com/feed.xml',
          title: 'Example Feed',
          description: 'A good feed',
          siteUrl: 'https://example.com',
          feedType: 'rss',
          itemCount: 42,
        },
      ],
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add by URL' }));
    expect(screen.getByText(/Enter a website or feed URL/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browse Popular Sources' }));
    expect(screen.getByPlaceholderText('Search sources...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add by URL' }));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'folder-2' } });

    const urlInput = screen.getByPlaceholderText('theregister.com or https://example.com/feed.xml');
    fireEvent.change(urlInput, { target: { value: ' https://example.com/feed.xml ' } });
    fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });

    expect(await screen.findByText('Example Feed')).toBeInTheDocument();
    expect(screen.getByText('A good feed')).toBeInTheDocument();
    expect(screen.getByText(/42 articles/)).toBeInTheDocument();
    expect(discoverApi.discover).toHaveBeenCalledWith('https://example.com/feed.xml');

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => {
      expect(feedsApi.subscribe).toHaveBeenCalledWith('https://example.com/feed.xml', 'folder-2');
    });

    expect(await screen.findByRole('button', { name: 'Added' })).toBeInTheDocument();
  });

  it('shows the no-feeds-found state and clears it when the URL changes', async () => {
    discoverApi.discover.mockResolvedValueOnce({ query: 'https://bad.example/feed', feeds: [] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add by URL' }));

    const urlInput = screen.getByPlaceholderText('theregister.com or https://example.com/feed.xml');
    fireEvent.change(urlInput, { target: { value: 'https://bad.example/feed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find feeds' }));

    expect(await screen.findByText('No feeds found')).toBeInTheDocument();

    fireEvent.change(urlInput, { target: { value: 'https://good.example/feed' } });

    await waitFor(() => {
      expect(screen.queryByText('No feeds found')).not.toBeInTheDocument();
    });
  });

  it('shows the no-feeds-found state when discovery fails outright', async () => {
    discoverApi.discover.mockRejectedValueOnce(new Error('network failed'));

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add by URL' }));

    const urlInput = screen.getByPlaceholderText('theregister.com or https://example.com/feed.xml');
    fireEvent.change(urlInput, { target: { value: 'https://bad.example/feed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find feeds' }));

    expect(await screen.findByText('No feeds found')).toBeInTheDocument();
  });

  it('shows already subscribed sources as added and disables the button', async () => {
    discoverApi.directory.mockResolvedValue({
      categories: ['Technology'],
      feeds: [
        {
          name: 'Already Added',
          url: 'https://added.example/rss',
          siteUrl: 'https://added.example',
          description: 'Already in the library',
          category: 'Technology',
          isSubscribed: true,
        },
      ],
    });

    renderPage();

    expect(await screen.findByText('Already Added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled();
  });

  it('shows the loading state, closes the modal, and ignores blank discover submissions', async () => {
    const onClose = vi.fn();
    discoverApi.directory.mockImplementationOnce(
      () => new Promise(() => {}),
    );

    const { container } = renderPage(onClose);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add by URL/i }));
    const findButton = screen.getByRole('button', { name: 'Find feeds' });
    expect(findButton).toBeDisabled();

    const urlInput = screen.getByPlaceholderText('theregister.com or https://example.com/feed.xml');
    fireEvent.change(urlInput, { target: { value: '   ' } });
    fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });
    expect(discoverApi.discover).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the fallback title when a discovered feed has no title or description', async () => {
    discoverApi.discover.mockResolvedValueOnce({
      query: 'https://example.com/untitled.xml',
      feeds: [
        {
          url: 'https://example.com/untitled.xml',
          title: null,
          description: null,
          siteUrl: null,
          feedType: 'rss',
          itemCount: 1,
        },
      ],
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add by URL' }));
    fireEvent.change(screen.getByPlaceholderText('theregister.com or https://example.com/feed.xml'), {
      target: { value: 'https://example.com/untitled.xml' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find feeds' }));

    expect(await screen.findByText('Untitled Feed')).toBeInTheDocument();
    expect(screen.getByText(/1 article ·/)).toBeInTheDocument();
  });

  it('shows pending states while discovering and subscribing', async () => {
    let resolveDiscover: ((value: unknown) => void) | undefined;
    let resolveSubscribe: ((value: unknown) => void) | undefined;

    discoverApi.directory.mockResolvedValueOnce({
      categories: ['Technology'],
      feeds: [
        {
          name: 'Pending Feed',
          url: 'https://pending.example/rss',
          siteUrl: 'https://pending.example',
          description: 'Pending state coverage',
          category: 'Technology',
          isSubscribed: false,
        },
      ],
    });
    discoverApi.discover.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDiscover = resolve; }),
    );
    feedsApi.subscribe.mockImplementation(
      () => new Promise((resolve) => { resolveSubscribe = resolve; }),
    );

    renderPage();

    expect(await screen.findByText('Pending Feed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: '...' })).toBeDisabled();
    resolveSubscribe?.({ id: 'feed-pending' });
    await waitFor(() => {
      expect(feedsApi.subscribe).toHaveBeenCalledWith('https://pending.example/rss', undefined);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add by URL' }));
    fireEvent.change(screen.getByPlaceholderText('theregister.com or https://example.com/feed.xml'), {
      target: { value: 'https://detecting.example/feed.xml' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find feeds' }));

    expect(await screen.findByRole('button', { name: 'Searching...' })).toBeDisabled();
    resolveDiscover?.({
      query: 'https://detecting.example/feed.xml',
      feeds: [
        {
          url: 'https://detecting.example/feed.xml',
          title: 'Detected Feed',
          description: null,
          siteUrl: null,
          feedType: 'rss',
          itemCount: 3,
        },
      ],
    });
    expect(await screen.findByText('Detected Feed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(await screen.findByRole('button', { name: 'Adding...' })).toBeDisabled();
  });

  it('handles undefined folders data and toggles a selected category back off', async () => {
    useFoldersMock.mockReturnValue({ data: undefined });
    discoverApi.directory.mockImplementation(async (params?: { category?: string }) => ({
      categories: ['Technology'],
      feeds: params?.category
        ? [
            {
              name: 'Tech Only',
              url: 'https://tech-only.example/rss',
              siteUrl: 'https://tech-only.example',
              description: 'Category-filtered',
              category: 'Technology',
              isSubscribed: false,
            },
          ]
        : [
            {
              name: 'General Feed',
              url: 'https://general.example/rss',
              siteUrl: 'https://general.example',
              description: 'General result',
              category: 'Technology',
              isSubscribed: false,
            },
          ],
    }));

    renderPage();

    expect(await screen.findByText('General Feed')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Technology' }));
    expect(await screen.findByText('Tech Only')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Technology' }));
    expect(await screen.findByText('General Feed')).toBeInTheDocument();
  });
});
