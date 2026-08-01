import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardNav } from './use-keyboard-nav.js';

const storeState = {
  focusedArticleIndex: 1,
  setFocusedArticleIndex: vi.fn(),
  selectArticle: vi.fn(),
};

vi.mock('../stores/index.js', () => ({
  useUiStore: () => storeState,
}));

function TestHarness(props: Parameters<typeof useKeyboardNav>[0]) {
  useKeyboardNav(props);
  return <div>keyboard-nav</div>;
}

describe('useKeyboardNav', () => {
  const articles = [
    { id: 'article-1', isStarred: false },
    { id: 'article-2', isStarred: true },
    { id: 'article-3', isStarred: false },
  ] as any[];

  beforeEach(() => {
    vi.clearAllMocks();
    storeState.focusedArticleIndex = 1;
  });

  it('navigates, opens, stars, marks read, escapes, and focuses search', () => {
    const onStar = vi.fn();
    const onMarkRead = vi.fn();

    const searchInput = document.createElement('input');
    searchInput.setAttribute('data-search-input', 'true');
    document.body.appendChild(searchInput);

    const { unmount } = render(
      <TestHarness articles={articles} onStar={onStar} onMarkRead={onMarkRead} />,
    );

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    expect(storeState.setFocusedArticleIndex).toHaveBeenCalledWith(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(storeState.setFocusedArticleIndex).toHaveBeenCalledWith(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(storeState.selectArticle).toHaveBeenCalledWith('article-2');
    expect(onMarkRead).toHaveBeenCalledWith(['article-2']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(onStar).toHaveBeenCalledWith('article-2', false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(onMarkRead).toHaveBeenCalledWith(['article-2']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(storeState.selectArticle).toHaveBeenCalledWith(null);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
    expect(document.activeElement).toBe(searchInput);

    unmount();
    searchInput.remove();
  });

  it('ignores keystrokes from editable targets and missing focused articles', () => {
    const onStar = vi.fn();
    const onMarkRead = vi.fn();
    storeState.focusedArticleIndex = 10;

    render(<TestHarness articles={articles} onStar={onStar} onMarkRead={onMarkRead} />);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));

    expect(storeState.setFocusedArticleIndex).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));

    expect(storeState.selectArticle).not.toHaveBeenCalledWith(expect.any(String));
    expect(onStar).not.toHaveBeenCalled();
    expect(onMarkRead).not.toHaveBeenCalled();

    input.remove();
  });

  it('ignores browser shortcuts and does not move focus for an empty feed', () => {
    const { rerender } = render(<TestHarness articles={articles} onStar={vi.fn()} />);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));
    expect(storeState.setFocusedArticleIndex).not.toHaveBeenCalled();

    rerender(<TestHarness articles={[]} onStar={vi.fn()} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    expect(storeState.setFocusedArticleIndex).not.toHaveBeenCalled();
  });
});
