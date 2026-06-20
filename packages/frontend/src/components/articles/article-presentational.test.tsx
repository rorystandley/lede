import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArticleCard } from './ArticleCard.js';
import { ArticleListItem } from './ArticleListItem.js';
import { ArticleMagazineItem } from './ArticleMagazineItem.js';

vi.mock('../shared/ArticlePlaceholder.js', () => ({
  ArticlePlaceholder: ({ size, seed }: { size: string; seed: string }) => (
    <div data-testid={`placeholder-${size}-${seed}`} />
  ),
}));

const baseArticle = {
  id: 'article-1',
  title: 'Story title',
  summary: 'Story summary',
  feedTitle: 'Example Feed',
  publishedAt: '2026-06-05T11:00:00.000Z',
  imageUrl: null,
  isRead: false,
  isStarred: false,
  tags: [{ id: 'tag-1', name: 'AI' }],
};

describe('article presentational components', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an article card, placeholder, tags, and star behavior', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    render(
      <ArticleCard
        article={baseArticle as any}
        isFocused={true}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('Story title')).toBeInTheDocument();
    expect(screen.getByText('Story summary')).toBeInTheDocument();
    expect(screen.getByText('Example Feed')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByTestId('placeholder-card-article-1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Story title'));
    expect(onClick).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onStar).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a list item with selected styling and image path', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    const { container } = render(
      <ArticleListItem
        article={{ ...baseArticle, imageUrl: 'https://example.com/image.jpg', isRead: true, isStarred: true } as any}
        isFocused={false}
        isSelected={true}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(container.querySelector('img[src="https://example.com/image.jpg"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove from saved' })).toBeInTheDocument();
    expect(container.querySelector('.bg-primary-50')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Story title'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from saved' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onStar).toHaveBeenCalledTimes(1);
  });

  it('renders featured and compact magazine variants', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    const { rerender, container } = render(
      <ArticleMagazineItem
        article={baseArticle as any}
        isFeatured={true}
        isFocused={true}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Story title' })).toBeInTheDocument();
    expect(screen.getByText('Story summary')).toBeInTheDocument();
    expect(screen.getByTestId('placeholder-card-article-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onStar).toHaveBeenCalledTimes(1);

    rerender(
      <ArticleMagazineItem
        article={{ ...baseArticle, title: null, summary: null, imageUrl: 'https://example.com/mag.jpg' } as any}
        isFeatured={false}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(container.querySelector('img[src="https://example.com/mag.jpg"]')).toBeInTheDocument();
    expect(screen.queryByText('Story summary')).not.toBeInTheDocument();

    // The compact (non-featured) magazine card also surfaces the Save button —
    // previously the star only appeared on the featured item.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onStar).toHaveBeenCalledTimes(2);
  });

  it('covers fallback branches for card and list item timestamps, titles, and placeholders', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    const { container, rerender } = render(
      <ArticleCard
        article={{
          ...baseArticle,
          title: null,
          summary: null,
          tags: [],
          imageUrl: 'https://example.com/card.jpg',
          publishedAt: '2026-04-01T12:00:00.000Z',
          isRead: true,
          isStarred: true,
        } as any}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(container.querySelector('img[src="https://example.com/card.jpg"]')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-04-01T12:00:00.000Z').toLocaleDateString())).toBeInTheDocument();
    expect(screen.queryByText('AI')).not.toBeInTheDocument();
    expect(container.querySelector('.hover\\:shadow-sm')).toBeInTheDocument();

    rerender(
      <ArticleListItem
        article={{
          ...baseArticle,
          title: null,
          summary: null,
          imageUrl: null,
          publishedAt: '2026-06-05T12:00:00.000Z',
          isRead: false,
          isStarred: false,
        } as any}
        isFocused={true}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getAllByText('Untitled')[0]).toBeInTheDocument();
    expect(screen.getByTestId('placeholder-thumb-article-1')).toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(container.querySelector('.bg-surface-tertiary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('renders the long-age list item timestamp branch as a locale date', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    render(
      <ArticleListItem
        article={{
          ...baseArticle,
          publishedAt: '2026-04-01T12:00:00.000Z',
        } as any}
        isFocused={false}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText(new Date('2026-04-01T12:00:00.000Z').toLocaleDateString())).toBeInTheDocument();
  });

  it('covers featured image and compact placeholder magazine branches', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    const { container, rerender } = render(
      <ArticleMagazineItem
        article={{
          ...baseArticle,
          imageUrl: 'https://example.com/featured.jpg',
          summary: null,
          publishedAt: '2026-06-04T12:00:00.000Z',
          isRead: true,
          isStarred: true,
        } as any}
        isFeatured={true}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(container.querySelector('img[src="https://example.com/featured.jpg"]')).toBeInTheDocument();
    expect(screen.getByText('1d')).toBeInTheDocument();
    expect(screen.queryByText('Story summary')).not.toBeInTheDocument();

    rerender(
      <ArticleMagazineItem
        article={{
          ...baseArticle,
          imageUrl: null,
          publishedAt: '2026-04-01T12:00:00.000Z',
          isRead: false,
        } as any}
        isFeatured={false}
        isFocused={true}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByTestId('placeholder-card-article-1')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-04-01T12:00:00.000Z').toLocaleDateString())).toBeInTheDocument();
    expect(container.querySelector('.border-primary-400')).toBeInTheDocument();
  });

  it('covers minute/day timestamp branches and missing published-at rendering', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    const { container, rerender } = render(
      <ArticleCard
        article={{
          ...baseArticle,
          publishedAt: '2026-06-05T11:30:00.000Z',
        } as any}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('30m')).toBeInTheDocument();

    rerender(
      <ArticleListItem
        article={{
          ...baseArticle,
          publishedAt: '2026-06-03T12:00:00.000Z',
          imageUrl: null,
        } as any}
        isFocused={false}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('2d')).toBeInTheDocument();

    rerender(
      <ArticleMagazineItem
        article={{
          ...baseArticle,
          publishedAt: null,
          summary: null,
          imageUrl: null,
        } as any}
        isFeatured={true}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.queryByText('2d')).not.toBeInTheDocument();
    expect(screen.queryByText('30m')).not.toBeInTheDocument();
    expect(container.querySelector('.text-text-tertiary')).toBeInTheDocument();
  });

  it('covers the remaining short-age and no-date branches across presentational variants', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    const { container, rerender } = render(
      <ArticleCard
        article={{
          ...baseArticle,
          publishedAt: '2026-06-05T11:59:30.000Z',
        } as any}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('now')).toBeInTheDocument();

    rerender(
      <ArticleCard
        article={{
          ...baseArticle,
          publishedAt: '2026-06-03T12:00:00.000Z',
        } as any}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('2d')).toBeInTheDocument();

    rerender(
      <ArticleListItem
        article={{
          ...baseArticle,
          publishedAt: '2026-06-05T11:30:00.000Z',
          imageUrl: null,
        } as any}
        isFocused={false}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('30m')).toBeInTheDocument();

    rerender(
      <ArticleListItem
        article={{
          ...baseArticle,
          publishedAt: null,
          imageUrl: null,
        } as any}
        isFocused={false}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.queryByText('30m')).not.toBeInTheDocument();

    rerender(
      <ArticleMagazineItem
        article={{
          ...baseArticle,
          publishedAt: '2026-06-05T11:59:30.000Z',
          title: null,
          isRead: true,
        } as any}
        isFeatured={false}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByText('Untitled')).toBeInTheDocument();
    expect(container.querySelector('.text-text-secondary.font-normal')).toBeInTheDocument();

    rerender(
      <ArticleMagazineItem
        article={{
          ...baseArticle,
          publishedAt: '2026-06-05T11:30:00.000Z',
        } as any}
        isFeatured={false}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByText('30m')).toBeInTheDocument();
  });

  it('covers missing card dates and featured untitled magazine headlines', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    const { container, rerender } = render(
      <ArticleCard
        article={{
          ...baseArticle,
          publishedAt: null,
        } as any}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.queryByText('1h')).not.toBeInTheDocument();
    expect(container.querySelector('.text-text-tertiary')).toBeInTheDocument();

    rerender(
      <ArticleMagazineItem
        article={{
          ...baseArticle,
          title: null,
          summary: null,
        } as any}
        isFeatured={true}
        isFocused={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Untitled' })).toBeInTheDocument();
  });

  it('shows the unread dot only for unread articles and dims read ones', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    // Unread list item: dot present, row not dimmed.
    const unread = render(
      <ArticleListItem
        article={baseArticle as any}
        isFocused={false}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );
    expect(unread.getByLabelText('Unread')).toBeInTheDocument();
    expect(unread.container.querySelector('.opacity-60')).not.toBeInTheDocument();
    unread.unmount();

    // Read list item: dot gone, row dimmed.
    const read = render(
      <ArticleListItem
        article={{ ...baseArticle, isRead: true } as any}
        isFocused={false}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );
    expect(read.queryByLabelText('Unread')).not.toBeInTheDocument();
    expect(read.container.querySelector('.opacity-60')).toBeInTheDocument();
    read.unmount();

    // Same signal in the card and magazine views.
    const card = render(
      <ArticleCard article={baseArticle as any} isFocused={false} onClick={onClick} onStar={onStar} onToggleRead={onToggleRead} />,
    );
    expect(card.getByLabelText('Unread')).toBeInTheDocument();
    card.unmount();

    const magazine = render(
      <ArticleMagazineItem article={baseArticle as any} isFeatured={false} isFocused={false} onClick={onClick} onStar={onStar} onToggleRead={onToggleRead} />,
    );
    expect(magazine.getByLabelText('Unread')).toBeInTheDocument();
  });

  it('exposes a read toggle on each variant that fires without opening the article', () => {
    const onClick = vi.fn();
    const onStar = vi.fn();
    const onToggleRead = vi.fn();

    // Unread article: the toggle invites you to mark it read.
    const card = render(
      <ArticleCard article={baseArticle as any} isFocused={false} onClick={onClick} onStar={onStar} onToggleRead={onToggleRead} />,
    );
    fireEvent.click(card.getByRole('button', { name: 'Mark as read' }));
    expect(onToggleRead).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
    card.unmount();

    // Read article: the toggle flips to mark unread.
    const listItem = render(
      <ArticleListItem
        article={{ ...baseArticle, isRead: true } as any}
        isFocused={false}
        isSelected={false}
        onClick={onClick}
        onStar={onStar}
        onToggleRead={onToggleRead}
      />,
    );
    fireEvent.click(listItem.getByRole('button', { name: 'Mark as unread' }));
    expect(onToggleRead).toHaveBeenCalledTimes(2);
    listItem.unmount();

    // Featured and compact magazine variants both surface the toggle.
    const featured = render(
      <ArticleMagazineItem article={baseArticle as any} isFeatured={true} isFocused={false} onClick={onClick} onStar={onStar} onToggleRead={onToggleRead} />,
    );
    fireEvent.click(featured.getByRole('button', { name: 'Mark as read' }));
    expect(onToggleRead).toHaveBeenCalledTimes(3);
    featured.unmount();

    const compact = render(
      <ArticleMagazineItem article={baseArticle as any} isFeatured={false} isFocused={false} onClick={onClick} onStar={onStar} onToggleRead={onToggleRead} />,
    );
    fireEvent.click(compact.getByRole('button', { name: 'Mark as read' }));
    expect(onToggleRead).toHaveBeenCalledTimes(4);
    expect(onClick).not.toHaveBeenCalled();
  });
});
