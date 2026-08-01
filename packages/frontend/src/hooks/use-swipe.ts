import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeInfo {
  /** Pointer x at the moment the gesture started. */
  startX: number;
  /** Pointer y at the moment the gesture started. */
  startY: number;
  /** Total horizontal travel (positive = rightward). */
  deltaX: number;
  /** Total vertical travel (positive = downward). */
  deltaY: number;
}

export interface UseSwipeOptions {
  /** Fired once, on release, when travel along the locked axis clears `threshold`. */
  onSwipe?: (direction: SwipeDirection, info: SwipeInfo) => void;
  /** Fired on every move once a direction is locked — use for drag-follow visuals. */
  onMove?: (deltaX: number, deltaY: number) => void;
  /** Fired when a gesture is released or cancelled without crossing `threshold`. */
  onCancel?: () => void;
  /** Minimum travel (px) along the locked axis to count as a swipe. Default 60. */
  threshold?: number;
  /** How far the pointer must move before we lock onto an axis (px). Default 10. */
  lockThreshold?: number;
  /**
   * Which axis to report. `'x'` (default) ignores vertical drags so the page can
   * still scroll; `'y'` does the reverse; `'both'` tracks whichever wins.
   */
  axis?: 'x' | 'y' | 'both';
  /** When false the handlers are inert (e.g. on desktop). Default true. */
  enabled?: boolean;
}

interface GestureState {
  pointerId: number;
  startX: number;
  startY: number;
  lock: 'x' | 'y' | null;
  active: boolean;
}

export interface UseSwipeResult {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  /** Live horizontal offset while a horizontal swipe is in progress (0 otherwise). */
  dragX: number;
  /** True once a gesture has locked onto the tracked axis. */
  swiping: boolean;
}

/**
 * A small, dependency-free swipe primitive built on Pointer Events. It locks
 * onto the dominant axis after a few pixels of travel so it never fights the
 * browser's own scrolling: a mostly-vertical drag is abandoned (letting the
 * list scroll), while a mostly-horizontal drag is captured and reported.
 *
 * Consumers spread the returned pointer handlers onto an element and read
 * `dragX`/`swiping` for optional drag-follow feedback. Gestures augment the
 * existing click/keyboard controls — they never replace them.
 */
export function useSwipe(options: UseSwipeOptions = {}): UseSwipeResult {
  const {
    onSwipe,
    onMove,
    onCancel,
    threshold = 60,
    lockThreshold = 10,
    axis = 'x',
    enabled = true,
  } = options;

  const gesture = useRef<GestureState | null>(null);
  const [dragX, setDragX] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const reset = useCallback(() => {
    gesture.current = null;
    setDragX(0);
    setSwiping(false);
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      // Ignore secondary mouse buttons; touch/pen always report button 0.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      gesture.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lock: null,
        active: true,
      };
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const g = gesture.current;
      if (!g || !g.active || e.pointerId !== g.pointerId) return;

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;

      if (g.lock === null) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX < lockThreshold && absY < lockThreshold) return;
        g.lock = absX >= absY ? 'x' : 'y';
        // If the dominant axis isn't the one we track, bow out so the browser
        // (scrolling, text selection) can take over for the rest of the drag.
        if (axis !== 'both' && g.lock !== axis) {
          g.active = false;
          return;
        }
        // Keep receiving moves even if the pointer leaves the element.
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* not supported (e.g. jsdom) — safe to ignore */
        }
        setSwiping(true);
      }

      if (g.lock === 'x') {
        setDragX(dx);
        onMove?.(dx, dy);
      } else if (g.lock === 'y') {
        onMove?.(dx, dy);
      }
    },
    [axis, lockThreshold, onMove],
  );

  const finish = useCallback(
    (e: ReactPointerEvent, cancelled: boolean) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;

      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      const locked = g.active && g.lock !== null;
      const info: SwipeInfo = { startX: g.startX, startY: g.startY, deltaX: dx, deltaY: dy };

      reset();

      if (cancelled || !locked) {
        onCancel?.();
        return;
      }

      if (g.lock === 'x') {
        if (dx <= -threshold) onSwipe?.('left', info);
        else if (dx >= threshold) onSwipe?.('right', info);
        else onCancel?.();
      } else if (g.lock === 'y') {
        if (dy <= -threshold) onSwipe?.('up', info);
        else if (dy >= threshold) onSwipe?.('down', info);
        else onCancel?.();
      }
    },
    [onCancel, onSwipe, reset, threshold],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent) => finish(e, false), [finish]);
  const onPointerCancel = useCallback((e: ReactPointerEvent) => finish(e, true), [finish]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, dragX, swiping };
}
