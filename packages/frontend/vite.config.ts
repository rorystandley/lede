import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

/**
 * Stamps a content-derived cache version into the service worker at build time
 * so every deploy that changes the output ships a byte-different `sw.js`. The
 * browser then installs the new worker, which purges the old cache and claims
 * control — instead of the previous worker pinning a stale shell until users
 * manually clear their cache.
 */
function serviceWorkerCacheVersion(): Plugin {
  const distSw = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist/sw.js');
  let version = '';
  return {
    name: 'sw-cache-version',
    apply: 'build',
    writeBundle(_options, bundle) {
      // Hash the emitted (content-hashed) asset filenames: the version changes
      // exactly when the built bundle changes, and is stable otherwise.
      const names = Object.keys(bundle).sort().join('|');
      version = createHash('sha256').update(names).digest('hex').slice(0, 8);
    },
    closeBundle() {
      if (!version || !existsSync(distSw)) return;
      const code = readFileSync(distSw, 'utf8').replace(
        /const CACHE_NAME = '[^']*';/,
        `const CACHE_NAME = 'lede-${version}';`,
      );
      writeFileSync(distSw, code);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerCacheVersion()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
