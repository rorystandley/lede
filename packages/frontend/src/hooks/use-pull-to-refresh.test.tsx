import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePullToRefresh, type UsePullToRefreshOptions, type UsePullToRefreshResult } from './use-pull-to-refresh.js';

let api: UsePullToRefreshResult;

function Harness(props: UsePullToRefreshOptions) {
  api = usePullToRefresh(props);
  return <div>{api.pull}:{String(api.refreshing)}</div>;
}

function evt(o: Partial<{ pointerId: number; clientY: number; pointerType: string; scrollTop: number }> = {}) {
  return {
    pointerId: o.pointerId ?? 1,
    clientY: o.clientY ?? 0,
    pointerType: o.pointerType ?? 'touch',
    currentTarget: { scrollTop: o.scrollTop ?? 0 },
  } as never;
}

const down = (o?: Parameters<typeof evt>[0]) => act(() => api.handlers.onPointerDown(evt(o)));
const move = (o?: Parameters<typeof evt>[0]) => act(() => api.handlers.onPointerMove(evt(o)));
const up = (o?: Parameters<typeof evt>[0]) => act(() => api.handlers.onPointerUp(evt(o)));

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

    down({ clientY: 100, scrollTop: 0 });
    move({ clientY: 260, scrollTop: 0 }); // dy 160 -> pull 80 (>= 64)
    expect(api.pull).toBeGreaterThanOrEqual(64);

    up({ clientY: 260, scrollTop: 0 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(api.refreshing).toBe(true);

    await act(async () => { d.resolve(); await d.promise; });
    await waitFor(() => expect(api.refreshing).toBe(false));
  });

  it('does not trigger when the pull is under the threshold', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} threshold={64} />);

    down({ clientY: 100 });
    move({ clientY: 150 }); // dy 50 -> pull 25
    up({ clientY: 150 });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(api.pull).toBe(0);
  });

  it('does not engage unless the container is scrolled to the top', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} threshold={64} />);

    down({ clientY: 100, scrollTop: 40 }); // not at top -> no gesture
    move({ clientY: 300, scrollTop: 40 });
    up({ clientY: 300, scrollTop: 40 });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(api.pull).toBe(0);
  });

  it('abandons the pull if the drag turns upward', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} threshold={64} />);

    down({ clientY: 200 });
    move({ clientY: 320 }); // down -> pull builds
    expect(api.pull).toBeGreaterThan(0);
    move({ clientY: 180 }); // now above start -> reset
    expect(api.pull).toBe(0);
    up({ clientY: 180 });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores mouse input and is inert when disabled', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<Harness onRefresh={onRefresh} threshold={64} />);

    down({ clientY: 100, pointerType: 'mouse' });
    move({ clientY: 300, pointerType: 'mouse' });
    up({ clientY: 300, pointerType: 'mouse' });
    expect(onRefresh).not.toHaveBeenCalled();

    rerender(<Harness onRefresh={onRefresh} threshold={64} enabled={false} />);
    down({ clientY: 100 });
    move({ clientY: 300 });
    up({ clientY: 300 });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
