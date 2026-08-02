import { useCallback, useRef, useState } from 'react';

export interface UsePullToRefreshOptions {
  /** Called when the user pulls past the threshold. May return a promise; the
   *  spinner stays until it settles. */
  onRefresh: () => void | Promise<void>;
  /** Pull distance (px) required to trigger a refresh. Default 64. */
  threshold?: number;
  /** When false the gesture is inert (e.g. on desktop). Default true. */
  enabled?: boolean;
}

export interface UsePullToRefreshResult {
  /** Attach to the scrollable element. Wires native touch listeners so the
   *  pull survives iOS claiming the gesture as a scroll. */
  containerRef: (node: HTMLElement | null) => void;
  /** Current visible pull distance in px (after resistance). */
  pull: number;
  /** True while onRefresh is in flight. */
  refreshing: boolean;
  threshold: number;
}

/**
 * Touch pull-to-refresh for a scroll container. Only engages when the element
 * is scrolled to the very top and the drag is downward, so it never fights
 * normal scrolling.
 *
 * It uses native (non-passive) touch listeners rather than React's pointer
 * events: on iOS Safari a drag on a scrollable element is claimed as a native
 * scroll — which cancels pointer tracking — so we listen for `touchmove` with
 * `{ passive: false }` and `preventDefault()` while pulling to keep the gesture.
 */
export function usePullToRefresh({ onRefresh, threshold = 64, enabled = true }: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Latest values, read inside listeners without re-attaching them.
  const opts = useRef({ onRefresh, threshold, enabled, refreshing });
  opts.current = { onRefresh, threshold, enabled, refreshing };

  const startY = useRef(0);
  const pulling = useRef(false);
  const pulled = useRef(0);
  const detach = useRef<() => void>(() => {});

  const containerRef = useCallback((node: HTMLElement | null) => {
    detach.current();
    detach.current = () => {};
    if (!node) return;

    const reset = () => {
      pulled.current = 0;
      setPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      const { enabled, refreshing } = opts.current;
      if (!enabled || refreshing || e.touches.length !== 1 || node.scrollTop > 0) {
        pulling.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      pulling.current = true;
      pulled.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      // Not a downward pull from the top — let native scrolling have it.
      if (dy <= 0 || node.scrollTop > 0) {
        reset();
        return;
      }
      // Actively pulling: take the gesture from native scroll.
      if (e.cancelable) e.preventDefault();
      const next = Math.min(dy * 0.5, opts.current.threshold * 1.5); // rubber-band resistance
      pulled.current = next;
      setPull(next);
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      const { onRefresh, threshold, refreshing } = opts.current;
      const triggered = pulled.current >= threshold;
      pulled.current = 0;
      setPull(0);
      if (triggered && !refreshing) {
        setRefreshing(true);
        Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
      }
    };

    const onTouchCancel = () => {
      pulling.current = false;
      reset();
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchCancel);

    detach.current = () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

  return { containerRef, pull, refreshing, threshold };
}
