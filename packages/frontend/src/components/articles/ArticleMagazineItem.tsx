import type { ArticleWithState } from '@lede/shared';
import { ArticlePlaceholder } from '../shared/ArticlePlaceholder.js';
import { ReadToggleButton } from '../shared/ReadToggleButton.js';
import { SaveButton } from '../shared/SaveButton.js';
import { UnreadDot } from '../shared/UnreadDot.js';

interface Props {
  article: ArticleWithState;
  isFeatured: boolean;
  isFocused: boolean;
  onClick: () => void;
  onStar: () => void;
  onToggleRead: () => void;
}

export function ArticleMagazineItem({ article, isFeatured, isFocused, onClick, onStar, onToggleRead }: Props) {
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
            <div className="flex items-start gap-2">
              {!article.isRead && <UnreadDot className="mt-2 shrink-0" />}
              <h2 className={`text-xl leading-snug ${article.isRead ? 'text-text-secondary font-normal' : 'text-text-primary font-bold'}`}>
                {article.title ?? 'Untitled'}
              </h2>
            </div>
            {article.summary && (
              <p className="text-sm text-text-secondary mt-3 line-clamp-3 lg:line-clamp-4">{article.summary}</p>
            )}
            {/* Action bar pinned to the bottom-right, matching the Cards view. */}
            <div className="flex items-center justify-end gap-1 mt-4">
              <ReadToggleButton isRead={article.isRead} onToggle={onToggleRead} size={16} />
              <SaveButton isSaved={article.isStarred} onToggle={onStar} size={16} />
            </div>
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
        {/* Action bar pinned to the bottom-right, matching the Cards view. */}
        <div className="flex items-center justify-end gap-1 mt-2">
          <ReadToggleButton isRead={article.isRead} onToggle={onToggleRead} size={14} />
          <SaveButton isSaved={article.isStarred} onToggle={onStar} size={14} />
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
