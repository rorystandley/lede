import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.js';

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Mark all as read"
      message="Mark all 5 articles as read?"
      confirmLabel="Mark all read"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="t" message="m" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('confirms when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels via the cancel button, backdrop click, and Escape', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('dialog').parentElement!);
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('does not bubble clicks inside the dialog to the backdrop', async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.click(screen.getByRole('dialog'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables both buttons while pending', () => {
    setup({ isPending: true });
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('uses a danger style for the confirm button when tone is danger', () => {
    setup({ tone: 'danger', confirmLabel: 'Delete' });
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-red-600');
  });
});
