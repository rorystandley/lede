import { useUiStore } from '../../stores/index.js';

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm animate-slide-up ${
            toast.type === 'error'
              ? 'bg-red-600 text-white'
              : toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-surface-secondary text-text-primary border border-border'
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                dismiss(toast.id);
              }}
              className="ml-1 shrink-0 rounded px-2 py-1 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="opacity-60 hover:opacity-100 ml-2 text-xs"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
