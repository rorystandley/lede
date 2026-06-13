#!/usr/bin/env node
// Regenerate postman/lede.postman_collection.json from the live OpenAPI spec.
//
// The route list (paths, methods, tags, summaries) is taken from the backend's
// own OpenAPI document — so adding/removing/renaming a route is reflected
// automatically and can never silently drift. Request bodies and query params
// are NOT in the spec (routes validate with Zod inside handlers), so those come
// from the curated EXAMPLES map below, keyed by "METHOD /path".
//
// Usage:
//   node scripts/generate-postman.mjs           # regenerate the collection
//   node scripts/generate-postman.mjs --check    # don't write; exit 1 on drift
//
// Prefer `pnpm gen:postman`, which builds the backend first.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const OUT = join(repoRoot, 'postman', 'lede.postman_collection.json');
const checkOnly = process.argv.includes('--check');

// Config validation runs at buildApp() time. We never open a DB/Redis
// connection (clients are lazy; rate-limit only registers in production), so
// dummy values are enough to let the app boot and emit its spec offline.
process.env.NODE_ENV ||= 'development';
process.env.LOG_LEVEL ||= 'fatal'; // keep the app's boot logs out of the generator output
process.env.DATABASE_URL ||= 'postgresql://localhost:5432/lede';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.JWT_SECRET ||= 'postman-generator-placeholder-secret';
process.env.JWT_REFRESH_SECRET ||= 'postman-generator-placeholder-secret';
process.env.ENCRYPTION_KEY ||= 'postman-generator-placeholder-secret';

// ---------------------------------------------------------------------------
// Curated examples: bodies / query params / auth overrides / token capture.
// Key format: "METHOD /openapi/path" (path uses {param}, exactly as the spec).
// ---------------------------------------------------------------------------
const T = '{{accessToken}}';
const EXAMPLES = {
  // --- Auth ---
  'POST /api/v1/auth/register': { auth: 'noauth', capture: 'tokens', body: { email: 'you@example.com', password: 'supersecret123', displayName: 'Your Name' } },
  'POST /api/v1/auth/login': { auth: 'noauth', capture: 'tokens', body: { email: 'you@example.com', password: 'supersecret123' } },
  'POST /api/v1/auth/refresh': { auth: 'noauth', capture: 'tokens', body: { refreshToken: '{{refreshToken}}' } },
  'POST /api/v1/auth/forgot-password': { auth: 'noauth', body: { email: 'you@example.com' } },
  'POST /api/v1/auth/reset-password': { auth: 'noauth', body: { token: '<reset-token-from-email>', password: 'newsupersecret123' } },
  'POST /api/v1/auth/api-keys': { capture: 'apiKey', body: { name: 'my-script' } },
  'DELETE /api/v1/auth/api-keys/{keyId}': {},

  // --- Feeds ---
  'GET /api/v1/feeds': { query: [{ key: 'folderId', value: '{{folderId}}', disabled: true }, { key: 'page', value: '1' }, { key: 'pageSize', value: '50' }] },
  'POST /api/v1/feeds': { capture: 'feedId', body: { url: 'https://hnrss.org/frontpage' } },
  'PATCH /api/v1/feeds/{feedId}': { body: { customTitle: 'Hacker News', folderId: null, notify: false, refreshInterval: 15 } },
  'POST /api/v1/feeds/refresh-all': {}, // action: no body
  'POST /api/v1/feeds/{feedId}/refresh': {}, // action: no body

  // --- Articles ---
  'GET /api/v1/articles': { query: [
    { key: 'feedId', value: '{{feedId}}', disabled: true },
    { key: 'folderId', value: '{{folderId}}', disabled: true },
    { key: 'tagId', value: '{{tagId}}', disabled: true },
    { key: 'isRead', value: 'false', disabled: true },
    { key: 'isStarred', value: 'true', disabled: true },
    { key: 'isArchived', value: 'false', disabled: true },
    { key: 'page', value: '1' }, { key: 'pageSize', value: '20' },
    { key: 'sort', value: 'published_at' }, { key: 'order', value: 'desc' },
  ] },
  'GET /api/v1/articles/search': { query: [{ key: 'q', value: 'postgres' }, { key: 'page', value: '1' }, { key: 'pageSize', value: '20' }] },
  'POST /api/v1/articles/{articleId}/extract': {}, // action: no body
  'POST /api/v1/articles/mark-all-read': { body: {} },
  'POST /api/v1/articles/mark-read': { body: { articleIds: ['{{articleId}}'] } },
  'POST /api/v1/articles/mark-unread': { body: { articleIds: ['{{articleId}}'] } },
  'PATCH /api/v1/articles/{articleId}/star': { body: { isStarred: true } },
  'PATCH /api/v1/articles/{articleId}/archive': { body: { isArchived: true } },

  // --- Folders ---
  'POST /api/v1/folders': { capture: 'folderId', body: { name: 'Tech News' } },
  'PATCH /api/v1/folders/{folderId}': { body: { name: 'Tech', sortOrder: 1 } },

  // --- Tags ---
  'POST /api/v1/tags': { capture: 'tagId', body: { name: 'must-read', color: '#33aa55' } },
  'PATCH /api/v1/tags/{tagId}': { body: { name: 'must-read', color: '#cc4444' } },
  'PUT /api/v1/tags/articles/{articleId}': { body: { tagIds: ['{{tagId}}'] } },
  'POST /api/v1/tags/articles/{articleId}/by-name': { body: { names: ['ai', 'databases'], source: 'manual' } },

  // --- Search ---
  'GET /api/v1/search': { query: [{ key: 'q', value: 'rust' }] },
  'POST /api/v1/search/saved': { body: { name: 'Rust mentions', query: 'rust', isMonitor: false, filters: { isRead: false } } },
  'PUT /api/v1/search/saved/{id}': { body: { name: 'Rust + Go', query: 'rust OR golang' } },

  // --- OPML ---
  'POST /api/v1/opml/import': { body: { opml: '<?xml version="1.0"?><opml version="2.0"><body><outline type="rss" text="Hacker News" xmlUrl="https://hnrss.org/frontpage"/></body></opml>' } },

  // --- Rules ---
  'POST /api/v1/rules': { body: { name: 'Star AI stories', matchMode: 'any', priority: 0, conditions: [{ field: 'title', op: 'contains', value: 'AI' }], actions: [{ type: 'star' }] } },
  'PATCH /api/v1/rules/{ruleId}': { body: { enabled: false } },

  // --- Digests ---
  'POST /api/v1/digests/build': {}, // action: no body
  'PATCH /api/v1/digests/{digestId}/delivered': {}, // action: no body

  // --- AI ---
  'POST /api/v1/ai/summarize/{articleId}': {}, // action: no body
  'POST /api/v1/ai/suggest-tags/{articleId}': {}, // action: no body
  'PUT /api/v1/ai/config': { body: { provider: 'anthropic', apiKey: 'sk-ant-...' } },

  // --- Stats ---
  'GET /api/v1/stats/daily': { query: [{ key: 'days', value: '30' }] },
  'POST /api/v1/stats/track': { body: { articleId: '{{articleId}}', readingTimeMs: 45000 } },

  // --- Annotations ---
  'POST /api/v1/annotations': { body: { articleId: '{{articleId}}', type: 'highlight', content: 'key insight', startOffset: 0, endOffset: 42, color: '#ffd54f' } },
  'PATCH /api/v1/annotations/{annotationId}': { body: { content: 'updated note', color: '#90caf9' } },

  // --- User ---
  'PATCH /api/v1/user/profile': { body: { displayName: 'Your Name', timezone: 'Europe/London', digestSchedule: '08:00', digestEnabled: true, digestEmail: true, digestPush: false } },

  // --- Discover ---
  'GET /api/v1/discover/directory': { auth: 'noauth', query: [{ key: 'category', value: 'Tech', disabled: true }, { key: 'q', value: 'news', disabled: true }] },
  'GET /api/v1/discover/directory/subscribed': { query: [{ key: 'category', value: 'Tech', disabled: true }, { key: 'q', value: 'news', disabled: true }] },
  'POST /api/v1/discover/detect': { body: { url: 'https://news.ycombinator.com' } },

  // --- Push ---
  'GET /api/v1/push/vapid-key': { auth: 'noauth' },
  'POST /api/v1/push/subscribe': { body: { endpoint: 'https://fcm.googleapis.com/fcm/send/...', keys: { p256dh: '<base64 key>', auth: '<base64 auth>' }, userAgent: 'postman' } },
  'DELETE /api/v1/push/subscribe': { body: { endpoint: 'https://fcm.googleapis.com/fcm/send/...' } },
  'POST /api/v1/push/test': {}, // action: no body

  // --- System / health ---
  'GET /api/health': { auth: 'noauth' },
  'GET /api/health/live': { auth: 'noauth' },
  'GET /api/health/ready': { auth: 'noauth' },
};

// Named test-scripts referenced by EXAMPLES[*].capture
const CAPTURE_SCRIPTS = {
  tokens: [
    'const json = pm.response.json();',
    "if (json.accessToken) pm.collectionVariables.set('accessToken', json.accessToken);",
    "if (json.refreshToken) pm.collectionVariables.set('refreshToken', json.refreshToken);",
  ],
  apiKey: [
    'const json = pm.response.json();',
    "if (json.key) pm.collectionVariables.set('apiKey', json.key);",
    "console.log('API key (shown once):', json.key);",
  ],
  feedId: ['const json = pm.response.json();', "if (json.feed && json.feed.id) pm.collectionVariables.set('feedId', json.feed.id);"],
  folderId: ['const json = pm.response.json();', "if (json && json.id) pm.collectionVariables.set('folderId', json.id);"],
  tagId: ['const json = pm.response.json();', "if (json && json.id) pm.collectionVariables.set('tagId', json.id);"],
};

const FOLDER_ORDER = ['Auth', 'Feeds', 'Articles', 'Folders', 'Tags', 'Search', 'OPML', 'Rules', 'Digests', 'AI', 'Stats', 'Annotations', 'Sharing', 'User', 'Discover', 'Push', 'System'];
const KNOWN_VARS = new Set(['feedId', 'articleId', 'folderId', 'tagId']);
const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'];

const COLLECTION_DESCRIPTION = [
  'Postman collection for the lede backend API. **Auto-generated by `pnpm gen:postman`** from the live OpenAPI spec — do not hand-edit.',
  '',
  'Base URL: `{{baseUrl}}` (default `http://localhost:3000`). Endpoints live under `/api/v1` (health under `/api`).',
  '',
  '## Authentication',
  'The collection sends `Authorization: Bearer {{accessToken}}` at the collection level, so every request inherits it. The backend accepts either a **JWT** access token (from `POST /auth/login` / `register`, 1h expiry) or a long-lived **API key** (`nrk_...` from `POST /auth/api-keys`) in that header.',
  '',
  '**Quick start:** run `Auth → Login` (its test script saves `accessToken` + `refreshToken` automatically), then call anything. Run `Auth → Refresh Token` when the JWT expires. To use an API key instead, set the `accessToken` variable to the `nrk_...` value. See `postman/README.md`.',
].join('\n');

// ---------------------------------------------------------------------------
function loadSpec() {
  const url = pathToFileURL(join(repoRoot, 'packages', 'backend', 'dist', 'app.js')).href;
  return import(url).then(async ({ buildApp }) => {
    const app = await buildApp();
    await app.ready();
    const spec = app.swagger();
    await app.close();
    return spec;
  });
}

function toPostmanPath(openapiPath) {
  // "/api/v1/feeds/{feedId}" -> { segments: ['api','v1','feeds',':feedId'], vars: ['feedId'] }
  const vars = [];
  const segments = openapiPath.replace(/^\//, '').split('/').map((seg) => {
    const m = seg.match(/^\{(.+)\}$/);
    if (m) { vars.push(m[1]); return `:${m[1]}`; }
    return seg;
  });
  return { segments, vars };
}

function buildRequest(method, path, op) {
  const ex = EXAMPLES[`${method.toUpperCase()} ${path}`] ?? {};
  const { segments, vars } = toPostmanPath(path);
  const rawQuery = ex.query ?? [];
  const queryString = rawQuery.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join('&');

  const url = {
    raw: `{{baseUrl}}/${segments.join('/')}${queryString ? `?${queryString}` : ''}`,
    host: ['{{baseUrl}}'],
    path: segments,
  };
  if (rawQuery.length) url.query = rawQuery;
  if (vars.length) url.variable = vars.map((v) => ({ key: v, value: KNOWN_VARS.has(v) ? `{{${v}}}` : (ex.pathVars?.[v] ?? '') }));

  const request = { method: method.toUpperCase(), header: [], url };
  if (ex.auth === 'noauth') request.auth = { type: 'noauth' };
  if (ex.body !== undefined) {
    request.header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: JSON.stringify(ex.body, null, 2), options: { raw: { language: 'json' } } };
  }
  if (op.description) request.description = op.description;

  const item = { name: op.summary || `${method.toUpperCase()} ${path}`, request };
  if (ex.capture) {
    item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: CAPTURE_SCRIPTS[ex.capture] } }];
  }
  return { item, hasExample: Object.keys(ex).length > 0 };
}

function main(spec) {
  const folders = new Map();
  const coveredKeys = new Set();
  const missingBody = [];

  const paths = Object.entries(spec.paths ?? {})
    .filter(([p]) => p.startsWith('/api/') && !p.startsWith('/api/docs'))
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [rawPath, ops] of paths) {
    // Fastify emits prefix-root routes with a trailing slash (e.g. "/api/v1/feeds/").
    // The server also serves the no-slash form (the frontend uses it), so canonicalize
    // to the clean no-slash path for both the URL and the example lookup.
    const path = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    for (const method of METHOD_ORDER) {
      const op = ops[method];
      if (!op) continue;
      const key = `${method.toUpperCase()} ${path}`;
      coveredKeys.add(key);
      const folderName = op.tags?.[0] ?? 'System';
      const { item } = buildRequest(method, path, op);
      if (!folders.has(folderName)) folders.set(folderName, []);
      folders.get(folderName).push(item);
      // A write route should have an EXAMPLES entry — a body, or {} to acknowledge
      // it intentionally takes none. An unlisted write route is real drift.
      if (['post', 'put', 'patch'].includes(method) && !EXAMPLES[key]) {
        missingBody.push(key);
      }
    }
  }

  const stale = Object.keys(EXAMPLES).filter((k) => !coveredKeys.has(k));

  const orderedFolderNames = [
    ...FOLDER_ORDER.filter((f) => folders.has(f)),
    ...[...folders.keys()].filter((f) => !FOLDER_ORDER.includes(f)).sort(),
  ];

  const collection = {
    info: {
      _postman_id: 'b9f4c1a2-7e3d-4a5b-9c8e-1d2f3a4b5c6d',
      name: 'lede API',
      description: COLLECTION_DESCRIPTION,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: T, type: 'string' }] },
    variable: [
      { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
      { key: 'accessToken', value: '', type: 'string' },
      { key: 'refreshToken', value: '', type: 'string' },
      { key: 'apiKey', value: '', type: 'string' },
      { key: 'feedId', value: '', type: 'string' },
      { key: 'articleId', value: '', type: 'string' },
      { key: 'folderId', value: '', type: 'string' },
      { key: 'tagId', value: '', type: 'string' },
    ],
    item: orderedFolderNames.map((name) => ({ name, item: folders.get(name) })),
  };

  // Drift report
  const total = [...folders.values()].reduce((n, items) => n + items.length, 0);
  console.log(`Routes in spec: ${total} across ${orderedFolderNames.length} folders`);
  if (missingBody.length) {
    console.log(`\n⚠️  ${missingBody.length} write route(s) are not in the EXAMPLES map (add an entry — a body, or {} if it takes none):`);
    for (const k of missingBody) console.log(`   - ${k}`);
  }
  if (stale.length) {
    console.log(`\n⚠️  ${stale.length} example(s) no longer match any route (remove from EXAMPLES):`);
    for (const k of stale) console.log(`   - ${k}`);
  }

  const hasDrift = missingBody.length > 0 || stale.length > 0;
  if (checkOnly) {
    const current = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return null; } })();
    const next = JSON.stringify(collection, null, 2) + '\n';
    if (current !== next) {
      console.log('\n❌ Collection is out of date. Run `pnpm gen:postman`.');
      process.exit(1);
    }
    if (hasDrift) { console.log('\n❌ Drift detected (see above).'); process.exit(1); }
    console.log('\n✅ Collection is up to date.');
    return;
  }

  writeFileSync(OUT, JSON.stringify(collection, null, 2) + '\n');
  console.log(`\n✅ Wrote ${OUT}`);
  if (!hasDrift) console.log('   No drift — every route has an example and no examples are stale.');
}

loadSpec().then(main).catch((err) => { console.error(err); process.exit(1); });
