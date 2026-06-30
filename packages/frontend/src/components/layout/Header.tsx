import { useState, useRef, useEffect } from 'react';
import { useUiStore, useAuthStore } from '../../stores/index.js';

interface HeaderProps {
  onOpenSettings?: () => void;
  onOpenRules?: () => void;
  onOpenDigest?: () => void;
  onOpenStats?: () => void;
  onOpenKeyboardShortcuts?: () => void;
}

export function Header({ onOpenSettings, onOpenRules, onOpenDigest, onOpenStats, onOpenKeyboardShortcuts }: HeaderProps) {
  const { theme, toggleTheme, toggleSidebar, viewMode, setViewMode } = useUiStore();
  const { user, logout } = useAuthStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  return (
    <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-3 md:px-4 shrink-0">
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 md:p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="lede" width={28} height={28} className="rounded-lg md:w-8 md:h-8" />
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary lowercase leading-none">
            lede<span style={{ color: '#12B981' }}>.</span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {/* View mode toggle */}
        <div className="flex bg-surface-tertiary rounded p-0.5">
          {(['list', 'card', 'magazine'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`p-1.5 md:px-2 md:py-1 text-xs rounded ${viewMode === mode ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary'}`}
              aria-label={mode}
            >
              {/* Icons on mobile, text on desktop */}
              <span className="md:hidden"><ViewModeIcon mode={mode} /></span>
              <span className="hidden md:inline capitalize">{mode}</span>
            </button>
          ))}
        </div>

        {/* Theme toggle — always visible */}
        <button
          onClick={toggleTheme}
          className="p-2 md:p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
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

        {/* Desktop: inline buttons — hidden on mobile */}
        <div className="hidden md:flex items-center gap-1">
          {onOpenStats && (
            <button onClick={onOpenStats} className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary" aria-label="Reading Stats" title="Reading Stats">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </button>
          )}
          {onOpenDigest && (
            <button onClick={onOpenDigest} className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary" aria-label="Morning Briefing" title="Morning Briefing">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
            </button>
          )}
          {onOpenRules && (
            <button onClick={onOpenRules} className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary" aria-label="Rules" title="Rules">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </button>
          )}
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary" aria-label="Settings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
          {onOpenKeyboardShortcuts && (
            <button
              onClick={onOpenKeyboardShortcuts}
              className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <KeyboardIcon />
            </button>
          )}
          {user && (
            <button onClick={logout} className="text-xs text-text-secondary hover:text-text-primary px-2 py-1">
              Logout
            </button>
          )}
        </div>

        {/* Mobile: overflow menu — hidden on desktop */}
        <div className="relative md:hidden" ref={moreRef}>
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className="p-2 rounded hover:bg-surface-tertiary text-text-secondary"
            aria-label="More options"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
            </svg>
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg py-1 z-50 animate-slide-up">
              {onOpenStats && (
                <MobileMenuItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>} label="Reading Stats" onClick={() => { onOpenStats(); setMoreOpen(false); }} />
              )}
              {onOpenDigest && (
                <MobileMenuItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>} label="Morning Briefing" onClick={() => { onOpenDigest(); setMoreOpen(false); }} />
              )}
              {onOpenRules && (
                <MobileMenuItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>} label="Rules" onClick={() => { onOpenRules(); setMoreOpen(false); }} />
              )}
              {onOpenSettings && (
                <MobileMenuItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>} label="Settings" onClick={() => { onOpenSettings(); setMoreOpen(false); }} />
              )}
              {onOpenKeyboardShortcuts && (
                <MobileMenuItem icon={<KeyboardIcon />} label="Keyboard shortcuts" onClick={() => { onOpenKeyboardShortcuts(); setMoreOpen(false); }} />
              )}
              {user && (
                <>
                  <div className="border-t border-border my-1" />
                  <MobileMenuItem icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>} label="Logout" onClick={() => { logout(); setMoreOpen(false); }} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MobileMenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-tertiary hover:text-text-primary">
      {icon}
      {label}
    </button>
  );
}

function KeyboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h.01M11 9h.01M15 9h.01M19 9h.01M7 13h.01M11 13h.01M15 13h.01M8 16h8" />
    </svg>
  );
}

function ViewModeIcon({ mode }: { mode: 'list' | 'card' | 'magazine' }) {
  if (mode === 'list') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
  if (mode === 'card') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="8" rx="1" /><rect x="3" y="14" width="8" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
