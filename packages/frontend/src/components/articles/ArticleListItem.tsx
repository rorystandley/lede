import type { ArticleWithState } from '@news-reader/shared';

interface Props {
  article: ArticleWithState;
  isFocused: boolean;
  isSelected: boolean;
  onClick: () => void;
  onStar: () => void;
}

export function ArticleListItem({ article, isFocused, isSelected, onClick, onStar }: Props) {
  const timeAgo = article.publishedAt ? formatTimeAgo(new Date(article.publishedAt)) : '';

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 border-b border-border cursor-pointer transition-colors ${
        isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : isFocused ? 'bg-surface-tertiary' : 'hover:bg-surface-secondary'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm leading-snug ${article.isRead ? 'text-text-secondary font-normal' : 'text-text-primary font-medium'}`}>
            {article.title ?? 'Untitled'}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-tertiary truncate">{article.feedTitle}</span>
            {timeAgo && <span className="text-xs text-text-tertiary">{timeAgo}</span>}
          </div>
          {article.summary && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{article.summary}</p>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          className={`p-1 shrink-0 ${article.isStarred ? 'text-yellow-500' : 'text-text-tertiary hover:text-yellow-500'}`}
          aria-label={article.isStarred ? 'Unstar' : 'Star'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={article.isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>

        {article.imageUrl && (
          <img src={article.imageUrl} alt="" loading="lazy" decoding="async" className="w-16 h-12 rounded object-cover shrink-0" />
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return date.toLocaleDateString();
}
