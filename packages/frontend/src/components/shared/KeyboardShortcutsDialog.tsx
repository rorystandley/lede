import { useEffect, useRef } from 'react';
import { keyboardShortcutGroups } from '../../lib/keyboard-shortcuts.js';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      // Keep app-level shortcuts from firing behind the modal.
      event.stopPropagation();

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab') {
        // The close button is the only interactive control in this dialog.
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        aria-describedby="keyboard-shortcuts-description"
        className="w-full rounded-t-xl border border-border bg-surface shadow-xl md:max-w-lg md:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="keyboard-shortcuts-title" className="text-base font-semibold text-text-primary">
              Keyboard shortcuts
            </h2>
            <p id="keyboard-shortcuts-description" className="mt-1 text-sm text-text-secondary">
              Move through your feed without reaching for the mouse.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="-mr-1 rounded p-1.5 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
            aria-label="Close keyboard shortcuts"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          {keyboardShortcutGroups.map((group) => (
            <section key={group.title} className={group.title === 'Anywhere' ? 'sm:col-span-2' : undefined}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {group.title}
              </h3>
              <dl className="space-y-2.5">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between gap-4">
                    <dt className="text-sm text-text-secondary">{shortcut.description}</dt>
                    <dd className="flex shrink-0 items-center gap-1" aria-label={shortcut.keys.join(' or ')}>
                      {shortcut.keys.map((key, index) => (
                        <span key={key} className="flex items-center gap-1">
                          {index > 0 && <span className="text-xs text-text-tertiary">or</span>}
                          <kbd className="min-w-7 rounded border border-border bg-surface-secondary px-2 py-1 text-center font-mono text-xs font-medium text-text-primary shadow-sm">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="border-t border-border bg-surface-secondary px-5 py-3 text-center text-xs text-text-tertiary md:rounded-b-xl">
          Shortcuts are paused while you type in a field.
        </div>
      </div>
    </div>
  );
}
