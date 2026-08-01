/**
 * Per-article "mark as read / unread" toggle used on feed items (card, list,
 * magazine). A check-in-circle that fills emerald once read — mirroring the
 * star button's fill-on-active pattern — so you can clear an article straight
 * from the feed without opening it.
 */
interface Props {
  isRead: boolean;
  onToggle: () => void;
  size?: number;
  /** Padding/extra classes; defaults to the standard p-1 hit area. */
  className?: string;
}

export function ReadToggleButton({ isRead, onToggle, size = 14, className = 'p-1' }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
      title={isRead ? 'Mark as unread' : 'Mark as read'}
      className={`shrink-0 ${isRead ? 'text-primary-500' : 'text-text-tertiary hover:text-primary-500'} ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" fill={isRead ? 'currentColor' : 'none'} />
        <polyline points="7.5 12 10.5 15 16.5 9" stroke={isRead ? 'white' : 'currentColor'} />
      </svg>
    </button>
  );
}
