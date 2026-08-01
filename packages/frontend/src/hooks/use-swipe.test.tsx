import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSwipe, type UseSwipeOptions, type UseSwipeResult } from './use-swipe.js';

let api: UseSwipeResult;

function Harness(props: UseSwipeOptions) {
  api = useSwipe(props);
  return (
    <div data-testid="target">
      {api.dragX}:{String(api.swiping)}
    </div>
  );
}

/** Build a minimal object shaped like the React.PointerEvent fields the hook reads. */
function ptr(overrides: Partial<{ pointerId: number; clientX: number; clientY: number; pointerType: string; button: number }> = {}) {
  return {
    pointerId: 1,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
    button: 0,
    currentTarget: { setPointerCapture: vi.fn() },
    ...overrides,
  } as never;
}

function down(o?: Parameters<typeof ptr>[0]) {
  act(() => api.onPointerDown(ptr(o)));
}
function move(o?: Parameters<typeof ptr>[0]) {
  act(() => api.onPointerMove(ptr(o)));
}
function up(o?: Parameters<typeof ptr>[0]) {
  act(() => api.onPointerUp(ptr(o)));
}
function cancel(o?: Parameters<typeof ptr>[0]) {
  act(() => api.onPointerCancel(ptr(o)));
}

describe('useSwipe', () => {
  beforeEach(() => {
    render(<Harness />);
  });

  it('fires "left" and "right" once horizontal travel clears the threshold', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} threshold={60} />);

    down({ clientX: 100, clientY: 100 });
    move({ clientX: 60, clientY: 102 }); // locks x
    up({ clientX: 20, clientY: 102 }); // dx = -80
    expect(onSwipe).toHaveBeenCalledWith('left', expect.objectContaining({ deltaX: -80 }));

    down({ clientX: 100, clientY: 100 });
    move({ clientX: 140, clientY: 101 });
    up({ clientX: 175, clientY: 101 }); // dx = +75
    expect(onSwipe).toHaveBeenLastCalledWith('right', expect.objectContaining({ deltaX: 75 }));
  });

  it('does not fire when travel stays under the threshold (treated as a tap)', () => {
    const onSwipe = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onSwipe={onSwipe} onCancel={onCancel} threshold={60} />);

    down({ clientX: 100, clientY: 100 });
    move({ clientX: 120, clientY: 100 }); // locks x but only 20px
    up({ clientX: 130, clientY: 100 }); // dx = 30 < 60
    expect(onSwipe).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('ignores vertical drags on the default x axis so the list can still scroll', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} axis="x" threshold={40} />);

    down({ clientX: 100, clientY: 100 });
    move({ clientX: 104, clientY: 160 }); // dominant axis is y -> abandoned
    expect(api.swiping).toBe(false);
    up({ clientX: 104, clientY: 220 });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('tracks vertical swipes when axis is "y"', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} axis="y" threshold={50} />);

    down({ clientX: 100, clientY: 100 });
    move({ clientX: 101, clientY: 160 });
    up({ clientX: 101, clientY: 170 }); // dy = +70
    expect(onSwipe).toHaveBeenCalledWith('down', expect.objectContaining({ deltaY: 70 }));
  });

  it('reports drag offset and swiping state while a horizontal gesture is active', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} threshold={60} />);

    down({ clientX: 0, clientY: 0 });
    move({ clientX: 30, clientY: 2 });
    expect(api.swiping).toBe(true);
    expect(api.dragX).toBe(30);
    expect(onMove).toHaveBeenCalledWith(30, 2);

    // Releasing under threshold resets the visual offset.
    up({ clientX: 40, clientY: 2 });
    expect(api.dragX).toBe(0);
    expect(api.swiping).toBe(false);
  });

  it('is inert when disabled', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} enabled={false} />);

    down({ clientX: 0, clientY: 0 });
    move({ clientX: 200, clientY: 0 });
    up({ clientX: 200, clientY: 0 });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(api.swiping).toBe(false);
  });

  it('ignores non-primary mouse buttons but honours touch input', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} threshold={40} />);

    down({ clientX: 0, clientY: 0, pointerType: 'mouse', button: 2 });
    move({ clientX: 80, clientY: 0, pointerType: 'mouse', button: 2 });
    up({ clientX: 80, clientY: 0, pointerType: 'mouse', button: 2 });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('treats pointercancel as a cancel, never a swipe', () => {
    const onSwipe = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onSwipe={onSwipe} onCancel={onCancel} threshold={40} />);

    down({ clientX: 0, clientY: 0 });
    move({ clientX: 90, clientY: 0 });
    cancel({ clientX: 90, clientY: 0 });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('ignores moves from a different pointer id', () => {
    const onSwipe = vi.fn();
    render(<Harness onSwipe={onSwipe} threshold={40} />);

    down({ pointerId: 1, clientX: 0, clientY: 0 });
    move({ pointerId: 2, clientX: 80, clientY: 0 }); // different finger
    up({ pointerId: 1, clientX: 0, clientY: 0 });
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
