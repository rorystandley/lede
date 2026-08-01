import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeableRow } from './SwipeableRow.js';

function icon() {
  return <span data-testid="icon" />;
}

function renderRow(overrides: Partial<Parameters<typeof SwipeableRow>[0]> = {}) {
  const onRight = vi.fn();
  const onLeft = vi.fn();
  render(
    <SwipeableRow
      threshold={60}
      rightAction={{ label: 'Save', icon: icon(), bg: 'bg-primary-600', onAction: onRight }}
      leftAction={{ label: 'Mark read', icon: icon(), bg: 'bg-surface-tertiary', onAction: onLeft }}
      {...overrides}
    >
      <button type="button" onClick={overrides.children ? undefined : vi.fn()}>
        Row content
      </button>
    </SwipeableRow>,
  );
  return { onRight, onLeft, target: screen.getByText('Row content') };
}

describe('SwipeableRow', () => {
  it('fires the right action on a rightward swipe past the threshold', () => {
    const { onRight, onLeft, target } = renderRow();

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 140, clientY: 52 });
    // Reveal panel shows the pending action while dragging.
    expect(screen.getByText('Save')).toBeInTheDocument();
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 175, clientY: 52 }); // dx = +75

    expect(onRight).toHaveBeenCalledTimes(1);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('fires the left action on a leftward swipe past the threshold', () => {
    const { onRight, onLeft, target } = renderRow();

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 200, clientY: 50 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 160, clientY: 50 });
    expect(screen.getByText('Mark read')).toBeInTheDocument();
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 120, clientY: 50 }); // dx = -80

    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).not.toHaveBeenCalled();
  });

  it('does not fire when the swipe falls short of the threshold', () => {
    const { onRight, onLeft, target } = renderRow();

    fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 130, clientY: 50 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 135, clientY: 50 }); // dx = 35 < 60

    expect(onRight).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('leaves clicks on the underlying row working', () => {
    const onClick = vi.fn();
    render(
      <SwipeableRow rightAction={{ label: 'Save', icon: icon(), bg: 'bg-primary-600', onAction: vi.fn() }}>
        <button type="button" onClick={onClick}>
          Tap me
        </button>
      </SwipeableRow>,
    );

    fireEvent.click(screen.getByText('Tap me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
