import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface UsePullToRefreshOptions {
  /** Called when the user pulls past the threshold. May return a promise; the
   *  spinner stays until it settles. */
  onRefresh: () => void | Promise<void>;
  /** Pull distance (px) required to trigger a refresh. Default 64. */
  threshold?: number;
  /** When false the handlers are inert (e.g. on desktop). Default true. */
  enabled?: boolean;
}

export interface UsePullToRefreshResult {
  handlers: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
  };
  /** Current visible pull distance in px (after resistance). */
  pull: number;
  /** True while onRefresh is in flight. */
  refreshing: boolean;
  threshold: number;
}

interface Gesture {
  pointerId: number;
  startY: number;
  active: boolean;
}

/**
 * Touch pull-to-refresh for a scroll container. Only engages when the element
 * is scrolled to the very top and the drag is downward, so it never fights
 * normal scrolling. Attach `handlers` to the scrollable element and render an
 * indicator from `pull`/`refreshing`.
 */
export function usePullToRefresh({ onRefresh, threshold = 64, enabled = true }: UsePullToRefreshOptions): UsePullToRefreshResult {
  const gesture = useRef<Gesture | null>(null);
  const pulledRef = useRef(0);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || refreshing) return;
      if (e.pointerType === 'mouse') return; // touch / pen only
      const el = e.currentTarget as HTMLElement;
      if (el.scrollTop > 0) return; // only start from the top
      gesture.current = { pointerId: e.pointerId, startY: e.clientY, active: true };
    },
    [enabled, refreshing],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const g = gesture.current;
      if (!g || !g.active || e.pointerId !== g.pointerId) return;
      const el = e.currentTarget as HTMLElement;
      const dy = e.clientY - g.startY;
      // Abandon if the user scrolled or is dragging upward.
      if (dy <= 0 || el.scrollTop > 0) {
        pulledRef.current = 0;
        setPull(0);
        return;
      }
      // Rubber-band resistance, capped a little past the threshold.
      const next = Math.min(dy * 0.5, threshold * 1.5);
      pulledRef.current = next;
      setPull(next);
    },
    [threshold],
  );

  const finish = useCallback(
    async (e: ReactPointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gesture.current = null;
      const triggered = pulledRef.current >= threshold;
      pulledRef.current = 0;
      setPull(0);
      if (triggered && !refreshing) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    },
    [onRefresh, refreshing, threshold],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent) => void finish(e), [finish]);
  const onPointerCancel = useCallback(
    (e: ReactPointerEvent) => {
      if (gesture.current) gesture.current.active = false;
      pulledRef.current = 0;
      setPull(0);
    },
    [],
  );

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    pull,
    refreshing,
    threshold,
  };
}
