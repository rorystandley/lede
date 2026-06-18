import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  isPending = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button on open, and wire up Escape (cancel) / Enter (confirm).
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const confirmClass =
    tone === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : 'bg-primary-600 text-white hover:bg-primary-700';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-surface rounded-t-xl md:rounded-lg border border-border shadow-xl w-full md:max-w-sm md:mx-4 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <div className="text-sm text-text-secondary mt-1.5">{message}</div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary border border-border rounded hover:bg-surface-tertiary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={isPending}
            className={`px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
