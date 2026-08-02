import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useArticlesInfinite } from '../../hooks/use-articles-infinite.js';
import { useMarkRead, useMarkUnread, useStarArticle } from '../../hooks/use-articles.js';
import { useSearch } from '../../hooks/use-search.js';
import { useUiStore } from '../../stores/index.js';
import { useKeyboardNav } from '../../hooks/use-keyboard-nav.js';
import { useIsMobile } from '../../hooks/use-media-query.js';
import { usePullToRefresh, type UsePullToRefreshResult } from '../../hooks/use-pull-to-refresh.js';
import { ArticleListItem } from './ArticleListItem.js';
import { ArticleCard } from './ArticleCard.js';
import { ArticleMagazineItem } from './ArticleMagazineItem.js';
import { SwipeableRow } from './SwipeableRow.js';
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
  // support the Unread / All toggle. Saved and search are excluded: saved
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

  const isMobile = useIsMobile();
  const setArticleOrder = useUiStore((s) => s.setArticleOrder);

  // Keep the store's ordered id list in sync with what's rendered so the reader
  // can swipe to the previous/next article. Keyed on the joined ids so it only
  // writes when the ordering actually changes.
  const articleIds = useMemo(() => articles.map((a) => a.id), [articles]);
  useEffect(() => {
    setArticleOrder?.(articleIds);
  }, [articleIds, setArticleOrder]);

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

  // Swipe-right on a row toggles the star (same action as the Save button).
  const handleSwipeStar = (article: ArticleWithState) => {
    starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred });
  };

  // Swipe-left on a row marks it read (the mobile equivalent of "archive"),
  // with an Undo so the destructive-feeling gesture is always recoverable.
  const handleSwipeArchive = (article: ArticleWithState) => {
    if (article.isRead) return;
    patchCachedReadState(qc, article.id, true);
    markRead.mutate([article.id]);
    addToast('Marked as read', 'info', {
      label: 'Undo',
      onClick: () => {
        patchCachedReadState(qc, article.id, false);
        markUnread.mutate([article.id]);
      },
    });
  };

  // Pull-to-refresh (touch only): dragging down at the top of the list kicks
  // off a feed refresh, mirroring the toolbar's refresh button.
  const pullToRefresh = usePullToRefresh({
    enabled: isMobile,
    onRefresh: async () => {
      await refreshAllMut.mutateAsync().catch(() => {});
    },
  });

  const handleLoadMore = () => {
    if (!isSearching && infinite.hasNextPage && !infinite.isFetchingNextPage) {
      infinite.fetchNextPage();
    }
  };

  const totalCount = isSearching ? articles.length : (infinite.data?.pages[0]?.total ?? articles.length);

  const toolbar = (
    <>
    <div
      data-testid="article-list-toolbar"
      className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-border bg-surface-secondary px-3 py-1.5 min-h-10 shrink-0 sm:h-10 sm:flex-nowrap sm:px-4 sm:py-0"
    >
      <div className="shrink-0 text-xs text-text-tertiary">
        {totalCount} {totalCount === 1 ? 'article' : 'articles'}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1">
        {supportsReadFilter && (
          <div className="mr-1 flex shrink-0 rounded bg-surface-tertiary p-0.5" role="group" aria-label="Filter by read state">
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
          className="flex shrink-0 items-center gap-1.5 rounded border border-border p-1.5 text-xs text-text-secondary hover:bg-surface-tertiary hover:text-text-primary disabled:opacity-50 sm:px-2 sm:py-1"
          title="Mark all read"
          aria-label="Mark all read"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span className="hidden sm:inline">Mark all read</span>
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
        <ScrollContainer onNearBottom={handleLoadMore} pull={pullToRefresh}>
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
        <ScrollContainer onNearBottom={handleLoadMore} pull={pullToRefresh}>
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
        swipeEnabled={isMobile}
        onSwipeStar={handleSwipeStar}
        onSwipeArchive={handleSwipeArchive}
        pull={pullToRefresh}
      />
    </>
  );
}

/** Bookmark glyph shown in the swipe-to-save reveal panel. */
function SwipeSaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** Check-circle glyph shown in the swipe-to-mark-read reveal panel. */
function SwipeReadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="7.5 12 10.5 15 16.5 9" />
    </svg>
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

function ScrollContainer({ children, onNearBottom, pull }: { children: React.ReactNode; onNearBottom: () => void; pull?: UsePullToRefreshResult }) {
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) onNearBottom();
  };

  return (
    <div className="relative flex-1 overflow-y-auto" onScroll={handleScroll} {...(pull?.handlers ?? {})}>
      {pull && <PullIndicator pull={pull.pull} refreshing={pull.refreshing} threshold={pull.threshold} />}
      {children}
    </div>
  );
}

/** Circular pull-to-refresh spinner shown as you drag the list down. */
function PullIndicator({ pull, refreshing, threshold }: { pull: number; refreshing: boolean; threshold: number }) {
  if (pull <= 0 && !refreshing) return null;
  const progress = Math.min(pull / threshold, 1);
  const offset = refreshing ? threshold : pull;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{ transform: `translateY(${Math.max(offset - 28, 0)}px)`, opacity: refreshing ? 1 : progress }}
      role="status"
      aria-label={refreshing ? 'Refreshing feeds' : undefined}
    >
      <div className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface shadow-sm ${refreshing ? 'animate-spin' : ''}`}>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="text-primary-600"
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        >
          <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </div>
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

function VirtualList({ articles, focusedArticleIndex, selectedArticleId, onClick, onStar, onToggleRead, onNearEnd, isFetchingMore, hasMore, swipeEnabled, onSwipeStar, onSwipeArchive, pull }: {
  articles: ArticleWithState[];
  focusedArticleIndex: number;
  selectedArticleId: string | null;
  onClick: (id: string, isRead: boolean) => void;
  onStar: (id: string, isStarred: boolean) => void;
  onToggleRead: (id: string, isRead: boolean) => void;
  onNearEnd: () => void;
  isFetchingMore: boolean;
  hasMore: boolean;
  swipeEnabled: boolean;
  onSwipeStar: (article: ArticleWithState) => void;
  onSwipeArchive: (article: ArticleWithState) => void;
  pull?: UsePullToRefreshResult;
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
    <div ref={parentRef} className="relative flex-1 overflow-y-auto" {...(pull?.handlers ?? {})}>
      {pull && <PullIndicator pull={pull.pull} refreshing={pull.refreshing} threshold={pull.threshold} />}
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
        {virtualItems.map((virtualRow) => {
          const article = articles[virtualRow.index];
          const row = (
            <ArticleListItem
              article={article}
              isFocused={virtualRow.index === focusedArticleIndex}
              isSelected={article.id === selectedArticleId}
              onClick={() => onClick(article.id, article.isRead)}
              onStar={() => onStar(article.id, !article.isStarred)}
              onToggleRead={() => onToggleRead(article.id, article.isRead)}
            />
          );
          return (
            <div
              key={article.id}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
            >
              {swipeEnabled ? (
                <SwipeableRow
                  rightAction={{
                    label: article.isStarred ? 'Unsave' : 'Save',
                    icon: <SwipeSaveIcon />,
                    bg: 'bg-primary-600',
                    onAction: () => onSwipeStar(article),
                  }}
                  leftAction={
                    article.isRead
                      ? undefined
                      : {
                          label: 'Mark read',
                          icon: <SwipeReadIcon />,
                          bg: 'bg-text-secondary',
                          onAction: () => onSwipeArchive(article),
                        }
                  }
                >
                  {row}
                </SwipeableRow>
              ) : (
                row
              )}
            </div>
          );
        })}
      </div>
      <LoadMoreSentinel isFetching={isFetchingMore} hasMore={hasMore} />
    </div>
  );
}
