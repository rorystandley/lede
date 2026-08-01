/**
 * Small emerald dot marking an article as unread. Rendered only for unread
 * articles — paired with dimming on the read row/card, it gives a clear,
 * scannable signal of what's been read while scrolling the feed.
 */
interface Props {
  className?: string;
}

export function UnreadDot({ className = '' }: Props) {
  return (
    <span
      aria-label="Unread"
      title="Unread"
      className={`block w-2 h-2 rounded-full bg-primary-500 ${className}`}
    />
  );
}
