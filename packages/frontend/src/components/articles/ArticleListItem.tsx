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
        <div className="min-w-0 flex-1">
          {/* Title + thumbnail share the top row; the title is clamped so a long
              headline can't blow the row up to full-screen height on mobile. */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className={`text-sm leading-snug line-clamp-3 ${article.isRead ? 'text-text-secondary font-normal' : 'text-text-primary font-semibold'}`}>
                {article.title ?? 'Untitled'}
              </h3>
              {article.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{article.summary}</p>
              )}
            </div>

            {article.imageUrl ? (
              <img src={article.imageUrl} alt="" loading="lazy" decoding="async" className="h-14 w-20 shrink-0 rounded object-cover" />
            ) : (
              <div className="h-14 w-20 shrink-0 overflow-hidden rounded"><ArticlePlaceholder size="thumb" seed={article.id} /></div>
            )}
          </div>

          {/* Action bar: source + time on the left, read/save actions on the
              right. Pinning the actions to their own row (instead of floating
              them between the text and thumbnail) keeps them from overlapping
              the content and gives them comfortable touch targets on mobile. */}
          <div className="mt-1.5 flex items-center gap-2 text-xs text-text-tertiary">
            <span className="min-w-0 truncate">{article.feedTitle}</span>
            {timeAgo && <span className="shrink-0">{timeAgo}</span>}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <ReadToggleButton
                isRead={article.isRead}
                onToggle={onToggleRead}
                size={16}
                className="flex min-h-11 min-w-11 items-center justify-center p-1 sm:min-h-9 sm:min-w-9"
              />
              <SaveButton
                isSaved={article.isStarred}
                onToggle={onStar}
                size={16}
                className="flex min-h-11 min-w-11 items-center justify-center p-1 sm:min-h-9 sm:min-w-9"
              />
            </div>
          </div>
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
