import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu.js';

describe('ContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 160 });
  });

  it('clamps to the viewport and handles regular item clicks', () => {
    const onClose = vi.fn();
    const onClick = vi.fn();

    const { container } = render(
      <ContextMenu
        x={250}
        y={300}
        onClose={onClose}
        items={[
          { label: 'Open', onClick, icon: <span>*</span> },
          { label: 'Delete', onClick: vi.fn(), danger: true },
        ]}
      />,
    );

    const menu = container.firstChild as HTMLElement;
    expect(menu.style.left).toBe('20px');
    expect(menu.style.top).toBe('72px');
    expect(screen.getByText('Delete').closest('button')?.className).toContain('text-red-500');

    fireEvent.click(screen.getByText('Open'));
    expect(onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('expands child menus, handles child clicks, and closes on outside click or escape', () => {
    const onClose = vi.fn();
    const onChildClick = vi.fn();

    render(
      <div>
        <button data-testid="outside">outside</button>
        <ContextMenu
          x={20}
          y={20}
          onClose={onClose}
          items={[
            {
              label: 'Move',
              onClick: vi.fn(),
              children: [
                { label: 'Inbox', value: 'inbox', active: true },
                { label: 'Archive', value: 'archive' },
              ],
              onChildClick,
            },
          ]}
        />
      </div>,
    );

    fireEvent.click(screen.getByText('Move'));
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Move'));
    expect(screen.queryByText('Inbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Move'));
    fireEvent.click(screen.getByText('Inbox'));
    expect(onChildClick).toHaveBeenCalledWith('inbox');
    expect(onClose).toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
