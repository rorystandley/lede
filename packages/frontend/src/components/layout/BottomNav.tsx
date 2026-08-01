import { useState } from 'react';
import type { ReactNode } from 'react';
import { useUiStore, useAuthStore } from '../../stores/index.js';

interface BottomNavProps {
  onOpenAddSources?: () => void;
  onOpenSettings?: () => void;
  onOpenStats?: () => void;
  onOpenDigest?: () => void;
  onOpenRules?: () => void;
}

/**
 * Mobile-only bottom navigation bar. Surfaces the main reading destinations and
 * a "More" sheet within thumb reach, so small screens no longer depend on the
 * desktop top toolbar. Hidden at `md` and up, where the header + sidebar drive
 * navigation. Lives in normal flow (not fixed) so list/reader content always
 * sits above it, and pads the iOS home-indicator safe area.
 */
export function BottomNav({ onOpenAddSources, onOpenSettings, onOpenStats, onOpenDigest, onOpenRules }: BottomNavProps) {
  const { showStarred, selectedFeedId, selectedFolderId, selectedTagId, isSearching, clearFilters, setShowStarred, setSidebarOpen } = useUiStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const isHome = !selectedFeedId && !selectedFolderId && !selectedTagId && !showStarred && !isSearching;

  // The search box lives in the sidebar drawer — open it and focus the field.
  const openSearch = () => {
    setSidebarOpen(true);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-search-input]')?.focus());
  };

  return (
    <>
      <nav
        className="md:hidden shrink-0 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <NavButton label="Home" active={isHome} onClick={() => clearFilters()} icon={<HomeIcon />} />
        <NavButton label="Feeds" onClick={() => setSidebarOpen(true)} icon={<FeedsIcon />} />
        <NavButton label="Search" active={isSearching} onClick={openSearch} icon={<SearchIcon />} />
        <NavButton label="Saved" active={showStarred} onClick={() => setShowStarred(true)} icon={<SavedIcon active={showStarred} />} />
        <NavButton label="More" active={moreOpen} onClick={() => setMoreOpen(true)} icon={<MoreIcon />} />
      </nav>

      {moreOpen && (
        <MoreSheet
          onClose={() => setMoreOpen(false)}
          onOpenAddSources={onOpenAddSources}
          onOpenSettings={onOpenSettings}
          onOpenStats={onOpenStats}
          onOpenDigest={onOpenDigest}
          onOpenRules={onOpenRules}
        />
      )}
    </>
  );
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${
        active ? 'text-primary-600 dark:text-primary-400' : 'text-text-secondary'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function MoreSheet({ onClose, onOpenAddSources, onOpenSettings, onOpenStats, onOpenDigest, onOpenRules }: {
  onClose: () => void;
  onOpenAddSources?: () => void;
  onOpenSettings?: () => void;
  onOpenStats?: () => void;
  onOpenDigest?: () => void;
  onOpenRules?: () => void;
}) {
  const { user, logout } = useAuthStore();
  const run = (fn?: () => void) => () => { onClose(); fn?.(); };

  return (
    <div className="md:hidden" role="dialog" aria-label="More options">
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] animate-slide-up">
        <div className="mx-auto my-2 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <div className="px-2 pb-3">
          {onOpenStats && <SheetItem label="Reading Stats" icon={<StatsIcon />} onClick={run(onOpenStats)} />}
          {onOpenDigest && <SheetItem label="Morning Briefing" icon={<BriefingIcon />} onClick={run(onOpenDigest)} />}
          {onOpenRules && <SheetItem label="Rules" icon={<RulesIcon />} onClick={run(onOpenRules)} />}
          {onOpenAddSources && <SheetItem label="Add Sources" icon={<PlusIcon />} onClick={run(onOpenAddSources)} />}
          {onOpenSettings && <SheetItem label="Settings" icon={<SettingsIcon />} onClick={run(onOpenSettings)} />}
          {user && (
            <>
              <div className="my-1 border-t border-border" />
              <SheetItem label="Logout" icon={<LogoutIcon />} onClick={run(logout)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetItem({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
    >
      {icon}
      {label}
    </button>
  );
}

/* --- icons --- */
const S = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const;
const Sm = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const;

function HomeIcon() {
  return <svg {...S}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
}
function FeedsIcon() {
  return <svg {...S}><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" fill="currentColor" /></svg>;
}
function SearchIcon() {
  return <svg {...S}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}
function SavedIcon({ active }: { active?: boolean }) {
  return <svg {...S} fill={active ? 'currentColor' : 'none'} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
}
function MoreIcon() {
  return <svg {...S}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>;
}
function StatsIcon() {
  return <svg {...Sm}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
}
function BriefingIcon() {
  return <svg {...Sm}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}
function RulesIcon() {
  return <svg {...Sm}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
}
function PlusIcon() {
  return <svg {...Sm}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function SettingsIcon() {
  return <svg {...Sm}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
function LogoutIcon() {
  return <svg {...Sm}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
}
