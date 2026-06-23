import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedPage } from './FeedPage.js';

const useUiStoreMock = vi.fn();
const sidebarMock = vi.fn();
const articleListMock = vi.fn();
const articleReaderMock = vi.fn();

vi.mock('../stores/index.js', () => ({
  useUiStore: () => useUiStoreMock(),
}));

vi.mock('../components/layout/Sidebar.js', () => ({
  Sidebar: (props: { onOpenAddSources?: () => void }) => {
    sidebarMock(props);
    return <div data-testid="sidebar" />;
  },
}));

vi.mock('../components/articles/ArticleList.js', () => ({
  ArticleList: () => {
    articleListMock();
    return <div data-testid="article-list" />;
  },
}));

vi.mock('../components/articles/ArticleReader.js', () => ({
  ArticleReader: () => {
    articleReaderMock();
    return <div data-testid="article-reader" />;
  },
}));

vi.mock('../hooks/use-document-title.js', () => ({
  useUnreadTitle: vi.fn(),
}));

describe('FeedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the article list when no article is selected', () => {
    useUiStoreMock.mockReturnValue({ selectedArticleId: null });
    const onOpenAddSources = vi.fn();

    render(<FeedPage onOpenAddSources={onOpenAddSources} />);

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('article-list')).toBeInTheDocument();
    expect(screen.queryByTestId('article-reader')).not.toBeInTheDocument();
    expect(sidebarMock).toHaveBeenCalledWith({ onOpenAddSources });
  });

  it('shows the reader and hides the list container when an article is selected', () => {
    useUiStoreMock.mockReturnValue({ selectedArticleId: 'article-1' });

    const { container } = render(<FeedPage />);

    expect(screen.getByTestId('article-reader')).toBeInTheDocument();
    expect(screen.getByTestId('article-list')).toBeInTheDocument();
    expect(container.querySelector('.hidden')).toBeInTheDocument();
  });
});
