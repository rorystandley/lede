import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePullToRefresh, type UsePullToRefreshOptions, type UsePullToRefreshResult } from './use-pull-to-refresh.js';

let api: UsePullToRefreshResult;

function Harness(props: UsePullToRefreshOptions) {
  api = usePullToRefresh(props);
  return <div data-testid="scroller" ref={api.containerRef}>{api.pull}:{String(api.refreshing)}</div>;
}

function scroller(): HTMLElement {
  return document.querySelector('[data-testid="scroller"]') as HTMLElement;
}

/** Dispatch a native touch event with a single touch point at clientY. */
function touch(el: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', clientY = 0) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as unknown as {
    touches: Array<{ clientY: number }>;
    changedTouches: Array<{ clientY: number }>;
  };
  const point = { clientY };
  e.touches = type === 'touchend' || type === 'touchcancel' ? [] : [point];
  e.changedTouches = [point];
  act(() => {
    el.dispatchEvent(e as unknown as Event);
  });
}

/** Pretend the scroller is scrolled down by `px`. */
function setScrollTop(el: HTMLElement, px: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: px });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('usePullToRefresh', () => {
  it('triggers onRefresh after a downward pull past the threshold', async () => {
    const d = deferred<void>();
    const onRefresh = vi.fn(() => d.promise);
    render(<Harness onRefresh={onRefresh} threshold={64} />);
    const el = scroller();

    touch(el, 'touchstart', 100);
    touch(el, 'touchmove', 260); // dy 160 -> pull 80 (>= 64)
    expect(api.pull).toBeGreaterThanOrEqual(64);

    touch(el, 'touchend', 260);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(api.refreshing).toBe(true);

    await act(async () => { d.resolve(); await d.promise; });
    await waitFor(() => expect(api.refreshing).toBe(false));
  });

  it('does not trigger when the pull is under the threshold', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} threshold={64} />);
    const el = scroller();

    touch(el, 'touchstart', 100);
    touch(el, 'touchmove', 150); // dy 50 -> pull 25
    touch(el, 'touchend', 150);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(api.pull).toBe(0);
  });

  it('does not engage unless the container is scrolled to the top', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} threshold={64} />);
    const el = scroller();
    setScrollTop(el, 40); // not at top

    touch(el, 'touchstart', 100);
    touch(el, 'touchmove', 300);
    touch(el, 'touchend', 300);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(api.pull).toBe(0);
  });

  it('abandons the pull if the drag turns upward', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} threshold={64} />);
    const el = scroller();

    touch(el, 'touchstart', 200);
    touch(el, 'touchmove', 320); // down -> pull builds
    expect(api.pull).toBeGreaterThan(0);
    touch(el, 'touchmove', 180); // now above start -> reset
    expect(api.pull).toBe(0);
    touch(el, 'touchend', 180);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('is inert when disabled', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} threshold={64} enabled={false} />);
    const el = scroller();

    touch(el, 'touchstart', 100);
    touch(el, 'touchmove', 300);
    touch(el, 'touchend', 300);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(api.pull).toBe(0);
  });
});
