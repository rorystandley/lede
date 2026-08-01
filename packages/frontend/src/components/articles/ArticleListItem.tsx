import type { ArticleWithState } from '@lede/shared';
import { ArticlePlaceholder } from '../shared/ArticlePlaceholder.js';
import { ReadToggleButton } from '../shared/ReadToggleButton.js';
import { SaveButton } from '../shared/SaveButton.js';
import { UnreadDot } from '../shared/UnreadDot.js';

interface Props {
  article: ArticleWithState;
  isFocused: boolean;
  isSelected: boolean;
  onClick: () => void;
  onStar: () => void;
  onToggleRead: () => void;
}

export function ArticleListItem({ article, isFocused, isSelected, onClick, onStar, onToggleRead }: Props) {
  const timeAgo = article.publishedAt ? formatTimeAgo(new Date(article.publishedAt)) : '';

  return (
    <div
      onClick={onClick}
      className={`px-4 py-3 border-b border-border cursor-pointer transition-colors ${
        isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : isFocused ? 'bg-surface-tertiary' : 'hover:bg-surface-secondary'
      }`}
    >
      <div className={`flex items-start gap-3 ${article.isRead ? 'opacity-60' : ''}`}>
        <div className="shrink-0 flex w-2 justify-center pt-1.5">
          {!article.isRead && <UnreadDot />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm leading-snug ${article.isRead ? 'text-text-secondary font-normal' : 'text-text-primary font-semibold'}`}>
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

        <ReadToggleButton isRead={article.isRead} onToggle={onToggleRead} />

        <SaveButton isSaved={article.isStarred} onToggle={onStar} />

        {article.imageUrl ? (
          <img src={article.imageUrl} alt="" loading="lazy" decoding="async" className="w-16 h-12 rounded object-cover shrink-0" />
        ) : (
          <div className="w-16 h-12 rounded overflow-hidden shrink-0"><ArticlePlaceholder size="thumb" seed={article.id} /></div>
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
