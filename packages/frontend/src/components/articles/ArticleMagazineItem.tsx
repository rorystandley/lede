import type { ArticleWithState } from '@lede/shared';
import { ArticlePlaceholder } from '../shared/ArticlePlaceholder.js';
import { UnreadDot } from '../shared/UnreadDot.js';

interface Props {
  article: ArticleWithState;
  isFeatured: boolean;
  isFocused: boolean;
  onClick: () => void;
  onStar: () => void;
}

export function ArticleMagazineItem({ article, isFeatured, isFocused, onClick, onStar }: Props) {
  const timeAgo = article.publishedAt ? formatTimeAgo(new Date(article.publishedAt)) : '';

  if (isFeatured) {
    return (
      <div
        onClick={onClick}
        className={`col-span-full rounded-lg border cursor-pointer overflow-hidden transition-all ${
          isFocused ? 'border-primary-400 shadow-md' : 'border-border hover:shadow-sm'
        } bg-surface ${article.isRead ? 'opacity-60' : ''}`}
      >
        <div className="flex flex-col md:flex-row">
          {article.imageUrl ? (
            <img src={article.imageUrl} alt="" loading="lazy" decoding="async" className="w-full md:w-2/5 lg:w-1/3 xl:w-1/4 h-48 md:h-64 object-cover" />
          ) : (
            <div className="w-full md:w-2/5 lg:w-1/3 xl:w-1/4 h-48 md:h-64">
              <ArticlePlaceholder size="card" seed={article.id} />
            </div>
          )}
          <div className="p-6 flex flex-col justify-center md:w-3/5 lg:w-2/3 xl:w-3/4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{article.feedTitle}</span>
              {timeAgo && <span className="text-xs text-text-tertiary">{timeAgo}</span>}
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                {!article.isRead && <UnreadDot className="mt-2 shrink-0" />}
                <h2 className={`text-xl leading-snug ${article.isRead ? 'text-text-secondary font-normal' : 'text-text-primary font-bold'}`}>
                  {article.title ?? 'Untitled'}
                </h2>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onStar(); }}
                className={`p-1 shrink-0 ${article.isStarred ? 'text-yellow-500' : 'text-text-tertiary hover:text-yellow-500'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={article.isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </div>
            {article.summary && (
              <p className="text-sm text-text-secondary mt-3 line-clamp-3 lg:line-clamp-4">{article.summary}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border cursor-pointer overflow-hidden transition-all ${
        isFocused ? 'border-primary-400 shadow-md' : 'border-border hover:shadow-sm'
      } bg-surface ${article.isRead ? 'opacity-60' : ''}`}
    >
      {article.imageUrl ? (
        <img src={article.imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-32 object-cover" />
      ) : (
        <div className="w-full h-32"><ArticlePlaceholder size="card" seed={article.id} /></div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-text-tertiary truncate">{article.feedTitle}</span>
          {timeAgo && <span className="text-[10px] text-text-tertiary">{timeAgo}</span>}
        </div>
        <div className="flex items-start gap-1.5">
          {!article.isRead && <UnreadDot className="mt-1.5 shrink-0" />}
          <h3 className={`text-sm leading-snug line-clamp-2 ${article.isRead ? 'text-text-secondary font-normal' : 'text-text-primary font-semibold'}`}>
            {article.title ?? 'Untitled'}
          </h3>
        </div>
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
