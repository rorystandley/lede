import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useArticlesInfinite } from '../../hooks/use-articles-infinite.js';
import { useMarkRead, useMarkUnread, useStarArticle } from '../../hooks/use-articles.js';
import { useSearch } from '../../hooks/use-search.js';
import { useUiStore } from '../../stores/index.js';
import { useKeyboardNav } from '../../hooks/use-keyboard-nav.js';
import { ArticleListItem } from './ArticleListItem.js';
import { ArticleCard } from './ArticleCard.js';
import { ArticleMagazineItem } from './ArticleMagazineItem.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import { articlesApi, feedsApi } from '../../api/index.js';
import type { ArticleWithState, PaginatedResult } from '@lede/shared';

type InfinitePages = { pages: PaginatedResult<ArticleWithState>[]; pageParams: unknown[] };

/**
 * Flip an article's read flag everywhere it's cached (the infinite feed pages
 * and any search result set) so the feed reflects the toggle instantly. We
 * patch in place rather than invalidate so the row stays put while browsing —
 * read items only drop out on the next natural refetch (reader close, refresh).
 */
function patchCachedReadState(qc: QueryClient, articleId: string, isRead: boolean) {
  qc.setQueriesData<InfinitePages>({ queryKey: ['articles-infinite'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((a) => (a.id === articleId ? { ...a, isRead } : a)),
          })),
        }
      : data,
  );
  qc.setQueriesData<PaginatedResult<ArticleWithState>>({ queryKey: ['search'] }, (data) =>
    data
      ? { ...data, items: data.items.map((a) => (a.id === articleId ? { ...a, isRead } : a)) }
      : data,
  );
}

export function ArticleList() {
  const qc = useQueryClient();
  const { selectedFeedId, selectedFolderId, selectedTagId, selectedArticleId, selectArticle, focusedArticleIndex, viewMode, searchQuery, isSearching, showStarred, readFilter, setReadFilter } = useUiStore();

  // Feed-like views (News Feed aggregate, a specific feed, a folder, or a tag)
  // support the Unread / All toggle. Starred and search are excluded: starred
  // should always surface read items, and search has its own result path.
  const supportsReadFilter = !showStarred && !isSearching;
  const unreadOnly = supportsReadFilter && readFilter === 'unread';

  const params = {
    ...(selectedFeedId ? { feedId: selectedFeedId } : {}),
    ...(selectedFolderId ? { folderId: selectedFolderId } : {}),
    ...(selectedTagId ? { tagId: selectedTagId } : {}),
    ...(showStarred ? { isStarred: true } : {}),
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const infinite = useArticlesInfinite(params);
  const { data: searchData, isLoading: searchLoading } = useSearch(searchQuery, isSearching);
  const markRead = useMarkRead();
  const markUnread = useMarkUnread();
  const starArticle = useStarArticle();

  // Refresh the infinite list only when the reader closes (selected → null), so
  // articles read in the unread-only News Feed drop out once you go back —
  // without yanking rows out from under the keyboard cursor while browsing.
  const prevSelectedRef = useRef<string | null>(selectedArticleId);
  useEffect(() => {
    if (prevSelectedRef.current && !selectedArticleId) {
      qc.invalidateQueries({ queryKey: ['articles-infinite'] });
    }
    prevSelectedRef.current = selectedArticleId;
  }, [selectedArticleId, qc]);

  const [confirmMarkAllOpen, setConfirmMarkAllOpen] = useState(false);

  const markAllReadMut = useMutation({
    mutationFn: () => articlesApi.markAllRead({
      feedId: selectedFeedId ?? undefined,
      folderId: selectedFolderId ?? undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['articles-infinite'] });
      qc.invalidateQueries({ queryKey: ['feeds'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
    },
    onSettled: () => setConfirmMarkAllOpen(false),
  });

  const addToast = useUiStore((s) => s.addToast);

  const refreshAllMut = useMutation({
    mutationFn: () => feedsApi.refreshAll(),
    onSuccess: () => {
      addToast('Feeds are refreshing...', 'info');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['articles-infinite'] });
        qc.invalidateQueries({ queryKey: ['feeds'] });
      }, 2000);
    },
    onError: () => {
      addToast('Failed to refresh feeds', 'error');
    },
  });

  const infiniteArticles = useMemo(
    () => infinite.data?.pages.flatMap((p) => p.items) ?? [],
    [infinite.data?.pages],
  );

  const articles = isSearching && searchQuery ? (searchData?.items ?? []) : infiniteArticles;
  const loading = isSearching ? searchLoading : (infinite.isLoading && articles.length === 0);

  useKeyboardNav({
    articles,
    onStar: (articleId, isStarred) => starArticle.mutate({ articleId, isStarred }),
    onMarkRead: (articleIds) => markRead.mutate(articleIds),
  });

  const handleClick = (articleId: string, isRead: boolean) => {
    selectArticle(articleId);
    if (!isRead) markRead.mutate([articleId]);
  };

  // Explicit per-article read toggle from the feed (doesn't open the reader).
  const handleToggleRead = (articleId: string, isRead: boolean) => {
    const next = !isRead;
    patchCachedReadState(qc, articleId, next);
    if (next) markRead.mutate([articleId]);
    else markUnread.mutate([articleId]);
  };

  const handleLoadMore = () => {
    if (!isSearching && infinite.hasNextPage && !infinite.isFetchingNextPage) {
      infinite.fetchNextPage();
    }
  };

  const totalCount = isSearching ? articles.length : (infinite.data?.pages[0]?.total ?? articles.length);

  const toolbar = (
    <>
    <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-surface-secondary shrink-0">
      <div className="text-xs text-text-tertiary">
        {totalCount} {totalCount === 1 ? 'article' : 'articles'}
      </div>
      <div className="flex items-center gap-1">
        {supportsReadFilter && (
          <div className="flex bg-surface-tertiary rounded p-0.5 mr-1" role="group" aria-label="Filter by read state">
            {(['unread', 'all'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setReadFilter(filter)}
                aria-pressed={readFilter === filter}
                className={`px-2 py-1 text-xs rounded ${readFilter === filter ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {filter === 'unread' ? 'Unread' : 'All articles'}
              </button>
            ))}
          </div>
        )}
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
          onClick={() => { if (totalCount > 0) setConfirmMarkAllOpen(true); }}
          disabled={markAllReadMut.isPending || articles.length === 0}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs border border-border text-text-secondary hover:text-text-primary hover:bg-surface-tertiary disabled:opacity-50"
          title="Mark all read"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span>Mark all read</span>
        </button>
      </div>
    </div>
    <ConfirmDialog
      open={confirmMarkAllOpen}
      title="Mark all as read"
      message={`Mark all ${totalCount} ${totalCount === 1 ? 'article' : 'articles'} as read?`}
      confirmLabel="Mark all read"
      isPending={markAllReadMut.isPending}
      onConfirm={() => markAllReadMut.mutate()}
      onCancel={() => setConfirmMarkAllOpen(false)}
    />
    </>
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
    // Caught up: in Unread view with nothing left to read. Offer a way to bring
    // back the older, already-read articles instead of a dead end — this is the
    // state you land on after "Mark all read" or when no new items have arrived.
    if (unreadOnly) {
      return (
        <>
          {toolbar}
          <CaughtUpState onSeeAll={() => setReadFilter('all')} />
        </>
      );
    }

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
        <ScrollContainer onNearBottom={handleLoadMore}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
            {articles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                isFocused={index === focusedArticleIndex}
                onClick={() => handleClick(article.id, article.isRead)}
                onStar={() => starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred })}
                onToggleRead={() => handleToggleRead(article.id, article.isRead)}
              />
            ))}
          </div>
          <LoadMoreSentinel isFetching={infinite.isFetchingNextPage} hasMore={infinite.hasNextPage} />
        </ScrollContainer>
      </>
    );
  }

  if (viewMode === 'magazine') {
    return (
      <>
        {toolbar}
        <ScrollContainer onNearBottom={handleLoadMore}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {articles.map((article, index) => (
              <ArticleMagazineItem
                key={article.id}
                article={article}
                isFeatured={index === 0}
                isFocused={index === focusedArticleIndex}
                onClick={() => handleClick(article.id, article.isRead)}
                onStar={() => starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred })}
                onToggleRead={() => handleToggleRead(article.id, article.isRead)}
              />
            ))}
          </div>
          <LoadMoreSentinel isFetching={infinite.isFetchingNextPage} hasMore={infinite.hasNextPage} />
        </ScrollContainer>
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
        onToggleRead={handleToggleRead}
        onNearEnd={handleLoadMore}
        isFetchingMore={infinite.isFetchingNextPage}
        hasMore={!!infinite.hasNextPage}
      />
    </>
  );
}

function CaughtUpState({ onSeeAll }: { onSeeAll: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center max-w-xs">
        <svg
          width="132"
          height="120"
          viewBox="0 0 132 120"
          fill="none"
          className="mx-auto mb-6"
          aria-hidden="true"
        >
          {/* soft backdrop */}
          <ellipse cx="66" cy="62" rx="60" ry="52" className="fill-primary-500/10" />
          {/* stacked article cards */}
          <g className="stroke-border" strokeWidth="2">
            <rect x="34" y="34" width="64" height="26" rx="5" className="fill-surface" />
            <rect x="34" y="64" width="64" height="26" rx="5" className="fill-surface" />
          </g>
          <g className="fill-text-tertiary/40">
            <rect x="42" y="41" width="16" height="12" rx="2" />
            <rect x="63" y="42" width="28" height="3.5" rx="1.75" />
            <rect x="63" y="49" width="20" height="3.5" rx="1.75" />
            <rect x="42" y="71" width="16" height="12" rx="2" />
            <rect x="63" y="72" width="28" height="3.5" rx="1.75" />
            <rect x="63" y="79" width="20" height="3.5" rx="1.75" />
          </g>
          {/* checkmark badge */}
          <circle cx="92" cy="86" r="14" className="fill-primary-500" />
          <path d="M86 86l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <h2 className="text-lg font-semibold text-text-primary">Great job!</h2>
        <p className="text-sm text-text-secondary mt-1">You've read everything in this section.</p>
        <button
          onClick={onSeeAll}
          className="mt-5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-primary bg-surface hover:bg-surface-tertiary"
        >
          See all articles
        </button>
      </div>
    </div>
  );
}

function ScrollContainer({ children, onNearBottom }: { children: React.ReactNode; onNearBottom: () => void }) {
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) onNearBottom();
  };

  return (
    <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
      {children}
    </div>
  );
}

function LoadMoreSentinel({ isFetching, hasMore }: { isFetching: boolean; hasMore: boolean }) {
  if (!isFetching && !hasMore) return <div className="text-center py-6 text-xs text-text-tertiary">End of feed</div>;
  if (isFetching) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  return null;
}

function VirtualList({ articles, focusedArticleIndex, selectedArticleId, onClick, onStar, onToggleRead, onNearEnd, isFetchingMore, hasMore }: {
  articles: ArticleWithState[];
  focusedArticleIndex: number;
  selectedArticleId: string | null;
  onClick: (id: string, isRead: boolean) => void;
  onStar: (id: string, isStarred: boolean) => void;
  onToggleRead: (id: string, isRead: boolean) => void;
  onNearEnd: () => void;
  isFetchingMore: boolean;
  hasMore: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  // Watch the last virtual item to trigger load more
  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;
  useEffect(() => {
    if (hasMore && !isFetchingMore && lastVirtualIndex >= articles.length - 8) {
      onNearEnd();
    }
  }, [lastVirtualIndex, articles.length, hasMore, isFetchingMore, onNearEnd]);

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
        {virtualItems.map((virtualRow) => {
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
                onToggleRead={() => onToggleRead(article.id, article.isRead)}
              />
            </div>
          );
        })}
      </div>
      <LoadMoreSentinel isFetching={isFetchingMore} hasMore={hasMore} />
    </div>
  );
}
