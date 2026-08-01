import { useEffect } from 'react';
import { useUiStore } from '../stores/index.js';
import type { ArticleWithState } from '@lede/shared';

interface UseKeyboardNavOpts {
  articles: ArticleWithState[];
  onStar?: (articleId: string, isStarred: boolean) => void;
  onMarkRead?: (articleIds: string[]) => void;
}

export function useKeyboardNav({ articles, onStar, onMarkRead }: UseKeyboardNavOpts) {
  const { focusedArticleIndex, setFocusedArticleIndex, selectArticle } = useUiStore();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) return;

      const article = articles[focusedArticleIndex];

      switch (e.key) {
        case 'j':
          e.preventDefault();
          if (articles.length > 0) {
            setFocusedArticleIndex(Math.min(focusedArticleIndex + 1, articles.length - 1));
          }
          break;
        case 'k':
          e.preventDefault();
          setFocusedArticleIndex(Math.max(focusedArticleIndex - 1, 0));
          break;
        case 'o':
        case 'Enter':
          e.preventDefault();
          if (article) {
            selectArticle(article.id);
            onMarkRead?.([article.id]);
          }
          break;
        case 's':
          e.preventDefault();
          if (article) onStar?.(article.id, !article.isStarred);
          break;
        case 'm':
          e.preventDefault();
          if (article) onMarkRead?.([article.id]);
          break;
        case 'Escape':
          e.preventDefault();
          selectArticle(null);
          break;
        case '/':
          e.preventDefault();
          document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
          break;
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [articles, focusedArticleIndex, setFocusedArticleIndex, selectArticle, onStar, onMarkRead]);
}
