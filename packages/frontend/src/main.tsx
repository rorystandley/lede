import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker for PWA + push notifications
if ('serviceWorker' in navigator) {
  // When a deploy ships a new service worker (its cache version changes per
  // build), it activates and claims control immediately. Reload once so the
  // open tab / installed PWA swaps to the fresh bundle instead of continuing
  // to run the previously cached shell. Guarded so it fires at most once.
  let reloading = false;
  navigator.serviceWorker.addEventListener?.('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
