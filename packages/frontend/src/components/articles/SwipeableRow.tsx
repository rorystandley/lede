import type { ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/use-media-query.js';
import { useSwipe } from '../../hooks/use-swipe.js';

export interface SwipeAction {
  /** Short label shown in the revealed panel, e.g. "Save" / "Mark read". */
  label: string;
  /** Icon element rendered next to the label. */
  icon: ReactNode;
  /** Tailwind background class for the reveal panel, e.g. "bg-primary-600". */
  bg: string;
  /** Fired once the swipe crosses the threshold. */
  onAction: () => void;
}

interface Props {
  children: ReactNode;
  /** Revealed by a rightward swipe (panel anchored on the left edge). */
  rightAction?: SwipeAction;
  /** Revealed by a leftward swipe (panel anchored on the right edge). */
  leftAction?: SwipeAction;
  /** Travel (px) needed to commit the action. Default 72. */
  threshold?: number;
}

/**
 * Wraps a feed row so it can be swiped left/right to trigger an action, with a
 * coloured panel and label that fade in behind the row as you drag. The row
 * itself follows the finger (direct manipulation), then springs back on
 * release unless the threshold was crossed.
 *
 * The gesture only augments the row's existing buttons — tapping still works,
 * and callers gate this to touch/small viewports. `prefers-reduced-motion`
 * removes the spring-back transition (the drag-follow is direct manipulation,
 * not a decorative animation, so it stays).
 */
export function SwipeableRow({ children, rightAction, leftAction, threshold = 72 }: Props) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, dragX, swiping } = useSwipe({
    axis: 'x',
    threshold,
    onSwipe: (direction) => {
      if (direction === 'right') rightAction?.onAction();
      else if (direction === 'left') leftAction?.onAction();
    },
  });

  // Which action is currently being revealed, based on drag direction.
  const revealed = dragX > 0 ? rightAction : dragX < 0 ? leftAction : null;
  const progress = Math.min(Math.abs(dragX) / threshold, 1);
  const committed = Math.abs(dragX) >= threshold;

  return (
    <div className="relative overflow-hidden" style={{ touchAction: 'pan-y' }}>
      {revealed && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 flex items-center ${
            dragX > 0 ? 'justify-start' : 'justify-end'
          } px-5 text-white ${revealed.bg}`}
          style={{ opacity: 0.4 + progress * 0.6 }}
        >
          <span className={`flex items-center gap-2 text-sm font-medium ${committed ? 'scale-110' : ''}`}>
            {revealed.icon}
            {revealed.label}
          </span>
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative bg-surface"
        style={{
          transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
          transition: swiping || reduceMotion ? 'none' : 'transform 0.2s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}
