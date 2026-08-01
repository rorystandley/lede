import type { ArticleWithState } from '@lede/shared';
import { ArticlePlaceholder } from '../shared/ArticlePlaceholder.js';
import { ReadToggleButton } from '../shared/ReadToggleButton.js';
import { SaveButton } from '../shared/SaveButton.js';
import { UnreadDot } from '../shared/UnreadDot.js';

interface Props {
  article: ArticleWithState;
  isFocused: boolean;
  onClick: () => void;
  onStar: () => void;
  onToggleRead: () => void;
}

export function ArticleCard({ article, isFocused, onClick, onStar, onToggleRead }: Props) {
  const timeAgo = article.publishedAt ? formatTimeAgo(new Date(article.publishedAt)) : '';

  return (
    <div
      onClick={onClick}
      className={`flex flex-col h-full rounded-lg border cursor-pointer overflow-hidden transition-all ${
        isFocused ? 'border-primary-400 shadow-md' : 'border-border hover:shadow-sm'
      } bg-surface ${article.isRead ? 'opacity-60' : ''}`}
    >
      {article.imageUrl ? (
        <img src={article.imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-40 object-cover shrink-0" />
      ) : (
        <div className="w-full h-40 shrink-0"><ArticlePlaceholder size="card" seed={article.id} /></div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          {!article.isRead && <UnreadDot className="mt-1 shrink-0" />}
          <h3 className={`text-sm leading-snug line-clamp-2 ${article.isRead ? 'text-text-secondary font-normal' : 'text-text-primary font-semibold'}`}>
            {article.title ?? 'Untitled'}
          </h3>
        </div>
        {article.summary && (
          <p className="text-xs text-text-secondary mt-2 line-clamp-3">{article.summary}</p>
        )}
        {article.tags.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {article.tags.map((tag) => (
              <span key={tag.id} className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-tertiary text-text-secondary">
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {/* Action bar pinned to the bottom so it aligns across cards of varying
            title/summary length. source + time on the left, actions on the right. */}
        <div className="flex items-center gap-2 mt-auto pt-3 text-xs text-text-tertiary">
          <span className="truncate min-w-0">{article.feedTitle}</span>
          {timeAgo && <span className="shrink-0">{timeAgo}</span>}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <ReadToggleButton isRead={article.isRead} onToggle={onToggleRead} size={16} />
            <SaveButton isSaved={article.isStarred} onToggle={onStar} size={16} />
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
