import { useArticles, useMarkRead, useStarArticle } from '../../hooks/use-articles.js';
import { useSearch } from '../../hooks/use-search.js';
import { useUiStore } from '../../stores/index.js';
import { useKeyboardNav } from '../../hooks/use-keyboard-nav.js';
import { ArticleListItem } from './ArticleListItem.js';
import { ArticleCard } from './ArticleCard.js';
import { ArticleMagazineItem } from './ArticleMagazineItem.js';

export function ArticleList() {
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

  const articles = isSearching && searchQuery ? (searchData?.items ?? []) : (data?.items ?? []);
  const loading = isSearching ? searchLoading : isLoading;

  useKeyboardNav({
    articles,
    onStar: (articleId, isStarred) => starArticle.mutate({ articleId, isStarred }),
    onMarkRead: (articleIds) => markRead.mutate(articleIds),
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        <div className="text-center">
          <p className="text-sm">{isSearching ? 'No results found' : 'No articles yet'}</p>
          <p className="text-xs mt-1">{isSearching ? 'Try a different search term' : 'Subscribe to feeds to start reading'}</p>
        </div>
      </div>
    );
  }

  const handleClick = (articleId: string, isRead: boolean) => {
    selectArticle(articleId);
    if (!isRead) markRead.mutate([articleId]);
  };

  if (viewMode === 'card') {
    return (
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
    );
  }

  if (viewMode === 'magazine') {
    return (
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
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {articles.map((article, index) => (
        <ArticleListItem
          key={article.id}
          article={article}
          isFocused={index === focusedArticleIndex}
          isSelected={article.id === selectedArticleId}
          onClick={() => handleClick(article.id, article.isRead)}
          onStar={() => starArticle.mutate({ articleId: article.id, isStarred: !article.isStarred })}
        />
      ))}
    </div>
  );
}
