/**
 * Per-article "Save" toggle used on feed items (card, list, magazine) and in
 * the reader. A bookmark that fills in the brand colour once saved — mirroring
 * the read toggle's fill-on-active pattern — so you can bookmark an article
 * straight from the feed. Saved articles surface under the sidebar's "Saved"
 * view. (Backed by the article's `isStarred` flag in the data layer.)
 */
interface Props {
  isSaved: boolean;
  onToggle: () => void;
  size?: number;
  /** Padding/extra classes; defaults to the standard p-1 hit area. */
  className?: string;
}

export function SaveButton({ isSaved, onToggle, size = 14, className = 'p-1' }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={isSaved ? 'Remove from saved' : 'Save'}
      title={isSaved ? 'Saved' : 'Save'}
      className={`shrink-0 ${isSaved ? 'text-primary-600' : 'text-text-tertiary hover:text-primary-600'} ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={isSaved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
