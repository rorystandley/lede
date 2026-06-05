import { useUiStore, useAuthStore } from '../../stores/index.js';

interface HeaderProps {
  onOpenSettings?: () => void;
  onOpenRules?: () => void;
  onOpenDigest?: () => void;
  onOpenStats?: () => void;
}

export function Header({ onOpenSettings, onOpenRules, onOpenDigest, onOpenStats }: HeaderProps) {
  const { theme, toggleTheme, toggleSidebar, viewMode, setViewMode } = useUiStore();
  const { user, logout } = useAuthStore();

  return (
    <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="lede" width={32} height={32} className="rounded-lg" />
          <h1 className="text-2xl font-bold tracking-tight text-text-primary lowercase leading-none">
            lede<span style={{ color: '#12B981' }}>.</span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex bg-surface-tertiary rounded p-0.5">
          {(['list', 'card', 'magazine'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 text-xs rounded capitalize ${viewMode === mode ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary'}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <button
          onClick={toggleTheme}
          className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>

        {onOpenStats && (
          <button
            onClick={onOpenStats}
            className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
            aria-label="Reading Stats"
            title="Reading Stats"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </button>
        )}

        {onOpenDigest && (
          <button
            onClick={onOpenDigest}
            className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
            aria-label="Morning Briefing"
            title="Morning Briefing"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
            </svg>
          </button>
        )}

        {onOpenRules && (
          <button
            onClick={onOpenRules}
            className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
            aria-label="Rules"
            title="Rules"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </button>
        )}

        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
            aria-label="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}

        {user && (
          <button
            onClick={logout}
            className="text-xs text-text-secondary hover:text-text-primary px-2 py-1"
          >
            Logout
          </button>
        )}
      </div>
    </header>
  );
}
