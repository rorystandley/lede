import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/index.js';
import { Header } from './components/layout/Header.js';
import { FeedPage } from './pages/FeedPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { RulesPage } from './pages/RulesPage.js';
import { DigestPage } from './pages/DigestPage.js';
import { StatsPage } from './pages/StatsPage.js';
import { AddSourcesPage } from './pages/AddSourcesPage.js';
import { ToastContainer } from './components/shared/Toast.js';
import { useEffect, useState } from 'react';
import { useUiStore } from './stores/index.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

function AppContent() {
  const { isAuthenticated } = useAuthStore();
  const { theme, selectArticle, setSidebarOpen } = useUiStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAddSources, setShowAddSources] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Close sidebar when viewport is narrow
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    if (mql.matches) setSidebarOpen(false);
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setSidebarOpen(false); };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [setSidebarOpen]);

  if (!isAuthenticated()) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen flex flex-col bg-surface">
      <Header
        onOpenSettings={() => setShowSettings(true)}
        onOpenRules={() => setShowRules(true)}
        onOpenDigest={() => setShowDigest(true)}
        onOpenStats={() => setShowStats(true)}
      />
      <FeedPage onOpenAddSources={() => setShowAddSources(true)} />
      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showRules && <RulesPage onClose={() => setShowRules(false)} />}
      {showDigest && <DigestPage onClose={() => setShowDigest(false)} onOpenArticle={(id) => selectArticle(id)} />}
      {showStats && <StatsPage onClose={() => setShowStats(false)} />}
      {showAddSources && <AddSourcesPage onClose={() => setShowAddSources(false)} />}
      <ToastContainer />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
