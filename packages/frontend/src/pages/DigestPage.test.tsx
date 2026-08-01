import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DigestPage } from './DigestPage.js';

const {
  useQueryMock,
  useMutationMock,
  invalidateQueriesMock,
  mutateMock,
  latestMock,
  buildMock,
} = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  mutateMock: vi.fn(),
  latestMock: vi.fn(),
  buildMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (args: unknown) => useQueryMock(args),
  useMutation: (args: unknown) => useMutationMock(args),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock('../api/index.js', () => ({
  digestsApi: {
    latest: latestMock,
    build: buildMock,
  },
}));

describe('DigestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutationMock.mockImplementation((options: { onSuccess?: () => void }) => ({
      isPending: false,
      mutate: () => {
        mutateMock();
        options.onSuccess?.();
      },
    }));
  });

  it('renders digest content and opens articles', () => {
    useQueryMock.mockReturnValue({
      data: {
        content: {
          date: '2026-06-05',
          stats: { totalArticles: 2, estimatedReadTimeMin: 4 },
          briefing: 'A concise briefing',
          sections: [
            {
              folder: 'Tech',
              feeds: [
                {
                  feedId: 'feed-1',
                  feedTitle: 'Example Feed',
                  articles: [
                    {
                      id: 'article-1',
                      title: 'First story',
                      aiSummary: 'AI summary',
                      summary: 'Fallback summary',
                      publishedAt: '2026-06-05T08:30:00.000Z',
                    },
                    {
                      id: 'article-2',
                      title: null,
                      aiSummary: null,
                      summary: 'Plain summary',
                      publishedAt: null,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      isLoading: false,
      error: null,
    });

    const onClose = vi.fn();
    const onOpenArticle = vi.fn();

    render(<DigestPage onClose={onClose} onOpenArticle={onOpenArticle} />);

    expect(screen.getByText('Morning Briefing')).toBeInTheDocument();
    expect(screen.getByText('2026-06-05 — 2 articles — ~4 min read')).toBeInTheDocument();
    expect(screen.getByText('A concise briefing')).toBeInTheDocument();
    expect(screen.getByText('Tech')).toBeInTheDocument();
    expect(screen.getByText('Example Feed')).toBeInTheDocument();
    expect(screen.getByText('AI summary')).toBeInTheDocument();
    expect(screen.getByText('Plain summary')).toBeInTheDocument();
    expect(screen.getByText('Untitled')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rebuild' }));
    expect(mutateMock).toHaveBeenCalled();
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['digest-latest'] });

    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('First story').closest('button')!);
    expect(onOpenArticle).toHaveBeenCalledWith('article-1');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows loading, empty, and build-prompt states', () => {
    useMutationMock.mockReturnValue({
      isPending: true,
      mutate: mutateMock,
    });
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: new Error('missing'),
    });

    const { rerender, container } = render(<DigestPage onClose={vi.fn()} onOpenArticle={vi.fn()} />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Building...' })).toBeDisabled();

    useMutationMock.mockReturnValue({
      isPending: false,
      mutate: mutateMock,
    });
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('missing'),
    });

    mutateMock.mockClear();
    rerender(<DigestPage onClose={vi.fn()} onOpenArticle={vi.fn()} />);
    expect(screen.getByText('No digest available yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Build Morning Briefing' }));
    expect(mutateMock).toHaveBeenCalledTimes(1);

    useQueryMock.mockReturnValue({
      data: {
        content: {
          date: '2026-06-05',
          stats: { totalArticles: 0, estimatedReadTimeMin: 0 },
          briefing: '',
          sections: [],
        },
      },
      isLoading: false,
      error: null,
    });

    rerender(<DigestPage onClose={vi.fn()} onOpenArticle={vi.fn()} />);
    expect(screen.getByText('All caught up! No new articles since your last digest.')).toBeInTheDocument();
  });

  it('renders digest articles without any summary text', () => {
    useQueryMock.mockReturnValue({
      data: {
        content: {
          date: '2026-06-05',
          stats: { totalArticles: 1, estimatedReadTimeMin: 1 },
          briefing: 'Brief',
          sections: [
            {
              folder: 'Misc',
              feeds: [
                {
                  feedId: 'feed-1',
                  feedTitle: 'Example Feed',
                  articles: [
                    {
                      id: 'article-3',
                      title: 'No summary article',
                      aiSummary: null,
                      summary: null,
                      publishedAt: '2026-06-05T09:00:00.000Z',
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      isLoading: false,
      error: null,
    });

    render(<DigestPage onClose={vi.fn()} onOpenArticle={vi.fn()} />);

    const card = screen.getByText('No summary article').closest('button') as HTMLButtonElement;
    expect(card).toBeInTheDocument();
    expect(card.querySelector('p')).toBeNull();
  });
});
