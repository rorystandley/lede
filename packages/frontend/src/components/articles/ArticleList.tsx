import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useArticles, useMarkRead, useStarArticle } from '../../hooks/use-articles.js';
import { useSearch } from '../../hooks/use-search.js';
import { useUiStore } from '../../stores/index.js';
import { useKeyboardNav } from '../../hooks/use-keyboard-nav.js';
import { ArticleListItem } from './ArticleListItem.js';
import { ArticleCard } from './ArticleCard.js';
import { ArticleMagazineItem } from './ArticleMagazineItem.js';
import { articlesApi, feedsApi } from '../../api/index.js';
import type { ArticleWithState } from '@news-reader/shared';

export function ArticleList() {
  const qc = useQueryClient();
  const { selectedFeedId, selectedFolderId, selectedTagId, selectedArticleId, selectArticle, focusedArticleIndex, viewMode, searchQuery, isSearching, showStarred } = useUiStore();

  const params = {
    ...(selectedFeedId ? { feedId: selectedFeedId } : {}),
    ...(selectedFolderId ? { folderId: selectedFolderId } : {}),
    ...(selectedTagId ? { tagId: selectedTagId } : {}),
    ...(showStarred ? { isStarred: true } : {}),
  };

  const { data, isLoading } = useArticles(params);
  const { data: searchData, isLoading: searchLoading } = useSearch(searchQuery, isSearching);
  const markRead = useMarkRead();
  const starArticle = useStarArticle();

  const markAllReadMut = useMutation({
    mutationFn: () => articlesApi.markAllRead({
      feedId: selectedFeedId ?? undefined,
      folderId: selectedFolderId ?? undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles'] });
      qc.invalidateQueries({ queryKey: ['feeds'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  const refreshAllMut = useMutation({
    mutationFn: () => feedsApi.refreshAll(),
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['articles'] });
        qc.invalidateQueries({ queryKey: ['feeds'] });
      }, 2000);
    },
  });

  const articles = isSearching && searchQuery ? (searchData?.items ?? []) : (data?.items ?? []);
  const loading = isSearching ? searchLoading : isLoading;

  useKeyboardNav({
    articles,
    onStar: (articleId, isStarred) => starArticle.mutate({ articleId, isStarred }),
    onMarkRead: (articleIds) => markRead.mutate(articleIds),
  });

  const handleClick = (articleId: string, isRead: boolean) => {
    selectArticle(articleId);
    if (!isRead) markRead.mutate([articleId]);
  };

  const toolbar = (
    <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-surface-secondary shrink-0">
      <div className="text-xs text-text-tertiary">
        {articles.length} {articles.length === 1 ? 'article' : 'articles'}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => refreshAllMut.mutate()}
          disabled={refreshAllMut.isPending}
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
          title="Refresh all feeds"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={refreshAllMut.isPending ? 'animate-spin' : ''}>
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button
          onClick={() => { if (articles.length > 0 && confirm(`Mark ${articles.length} articles as read?`)) markAllReadMut.mutate(); }}
          disabled={markAllReadMut.isPending || articles.length === 0}
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
          title="Mark all read"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <>
        {toolbar}
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      </>
    );
  }

  if (articles.length === 0) {
    return (
      <>
        {toolbar}
        <div className="flex-1 flex items-center justify-center text-text-tertiary">
          <div className="text-center">
            <p className="text-sm">{isSearching ? 'No results found' : 'No articles yet'}</p>
            <p className="text-xs mt-1">{isSearching ? 'Try a different search term' : 'Subscribe to feeds to start reading'}</p>
          </div>
        </div>
      </>
    );
  }

  if (viewMode === 'card') {
    return (
      <>
        {toolbar}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {articles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                isFocused={index === focusedArticleIndex}
                onClick={() => handleClick(article.id, article.isRead)}
                onStar={() => starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred })}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (viewMode === 'magazine') {
    return (
      <>
        {toolbar}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {articles.map((article, index) => (
              <ArticleMagazineItem
                key={article.id}
                article={article}
                isFeatured={index === 0}
                isFocused={index === focusedArticleIndex}
                onClick={() => handleClick(article.id, article.isRead)}
                onStar={() => starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred })}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}
      <VirtualList
        articles={articles}
        focusedArticleIndex={focusedArticleIndex}
        selectedArticleId={selectedArticleId}
        onClick={handleClick}
        onStar={(id, s) => starArticle.mutate({ articleId: id, isStarred: s })}
      />
    </>
  );
}

function VirtualList({ articles, focusedArticleIndex, selectedArticleId, onClick, onStar }: {
  articles: ArticleWithState[];
  focusedArticleIndex: number;
  selectedArticleId: string | null;
  onClick: (id: string, isRead: boolean) => void;
  onStar: (id: string, isStarred: boolean) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const article = articles[virtualRow.index];
          return (
            <div
              key={article.id}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
            >
              <ArticleListItem
                article={article}
                isFocused={virtualRow.index === focusedArticleIndex}
                isSelected={article.id === selectedArticleId}
                onClick={() => onClick(article.id, article.isRead)}
                onStar={() => onStar(article.id, !article.isStarred)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
