/**
 * Placeholder rendered when an article has no image. Doubles as a brand element.
 * Three size variants: 'thumb' (list item ~64x48), 'card' (h-32 to h-40), 'hero' (large).
 * Designed so it survives being swapped for a real logo later — just change the SVG.
 */

interface Props {
  size?: 'thumb' | 'card' | 'hero';
  className?: string;
  /** Optional seed so the gradient angle/tone varies per article — keeps a grid less monotonous. */
  seed?: string;
}

const GRADIENTS: Array<[string, string]> = [
  ['#1e40af', '#2563eb'], // blue
  ['#1d4ed8', '#3b82f6'], // blue lighter
  ['#1e3a8a', '#2563eb'], // navy → blue
  ['#312e81', '#4f46e5'], // indigo
  ['#1e40af', '#0ea5e9'], // blue → sky
];

function pickGradient(seed?: string): [string, string] {
  if (!seed) return GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

export function ArticlePlaceholder({ size = 'card', className, seed }: Props) {
  const [from, to] = pickGradient(seed);
  const gradientId = `nr-grad-${from.slice(1)}-${to.slice(1)}`;

  const showLabel = size !== 'thumb';
  const showTagline = size === 'hero';

  return (
    <div
      role="img"
      aria-label="News Reader"
      className={`relative w-full h-full overflow-hidden ${className ?? ''}`}
    >
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full block"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          {/* Subtle diagonal lines pattern */}
          <pattern id={`${gradientId}-lines`} width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
            <line x1="0" y1="0" x2="0" y2="24" stroke="white" strokeOpacity="0.06" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="400" height="240" fill={`url(#${gradientId})`} />
        <rect width="400" height="240" fill={`url(#${gradientId}-lines)`} />

        {/* Decorative "feed lines" — abstract article rows */}
        <g transform="translate(40 60)" opacity="0.18">
          <rect x="0" y="0" width="120" height="6" rx="3" fill="white" />
          <rect x="0" y="18" width="90" height="6" rx="3" fill="white" />
          <rect x="0" y="36" width="160" height="6" rx="3" fill="white" />
          <rect x="0" y="54" width="110" height="6" rx="3" fill="white" />
          <rect x="0" y="72" width="140" height="6" rx="3" fill="white" />
        </g>
        <g transform="translate(230 60)" opacity="0.12">
          <rect x="0" y="0" width="130" height="6" rx="3" fill="white" />
          <rect x="0" y="18" width="100" height="6" rx="3" fill="white" />
          <rect x="0" y="36" width="120" height="6" rx="3" fill="white" />
        </g>

        {/* Logo icon (centred) */}
        <g transform="translate(170 100)" fill="white">
          {/* Stylised feed/document mark */}
          <rect x="0" y="0" width="60" height="44" rx="6" fill="white" fillOpacity="0.18" />
          <rect x="6" y="6" width="48" height="6" rx="2" fill="white" />
          <rect x="6" y="18" width="36" height="4" rx="2" fill="white" fillOpacity="0.75" />
          <rect x="6" y="28" width="48" height="4" rx="2" fill="white" fillOpacity="0.55" />
          <rect x="6" y="36" width="28" height="4" rx="2" fill="white" fillOpacity="0.35" />
        </g>
      </svg>

      {showLabel && (
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center text-white">
          <div className={`font-semibold tracking-tight ${size === 'hero' ? 'text-lg' : 'text-xs'}`}>
            News&nbsp;Reader
          </div>
          {showTagline && (
            <div className="text-[11px] uppercase tracking-[0.18em] opacity-70 mt-1">
              No image available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
