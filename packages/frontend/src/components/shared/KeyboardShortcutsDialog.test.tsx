import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog.js';

describe('KeyboardShortcutsDialog', () => {
  it('renders every shortcut and closes with Escape', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsDialog open onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Move to the next article')).toBeInTheDocument();
    expect(screen.getByText('Open the focused article')).toBeInTheDocument();
    expect(screen.getByText('Star or unstar the focused article')).toBeInTheDocument();
    expect(screen.getByText('Focus search')).toBeInTheDocument();
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from the button and backdrop, and restores focus', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { rerender } = render(<KeyboardShortcutsDialog open onClose={onClose} />);
    const closeButton = screen.getByRole('button', { name: 'Close keyboard shortcuts' });
    expect(closeButton).toHaveFocus();

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(<KeyboardShortcutsDialog open={false} onClose={onClose} />);
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('renders nothing while closed', () => {
    render(<KeyboardShortcutsDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
