# Production Review And Fix Plan

Reviewed on 2026-06-05.

This document captures the production review findings, the recommended low-cost
infrastructure, and the concrete fix tracks. The current app is a good fit for a
single small host.

Implementation status:

- Object-level authorization: fixed in this change set.
- Article HTML sanitization: fixed in this change set.
- Frontend packaged with the production image: fixed in this change set.
- Refresh-token lookup performance: fixed in this change set.
- Automated regression tests: not added because the repo does not currently
  include a test runner.

## Executive Summary

The cheapest reliable production shape is:

- One small Linux VM running Docker Compose.
- One app image containing the backend, workers, and built frontend assets.
- Postgres and Redis on the same VM.
- Caddy on the host for HTTPS and reverse proxy.
- Daily Postgres backup off the VM.

The frontend should be packaged with the production image. The current
Dockerfile copies `packages/frontend/dist` into the image, and Fastify now
serves those files from the backend process. For the lowest-cost deployment,
keep the built SPA, API, MCP, and workers in the same app image and on the same
origin.

For true zero-cost hosting, Oracle Cloud Always Free is the best candidate, but
it has capacity and idle-reclamation caveats. For dependable production, use a
small paid VM in the roughly USD 5/month class.

## Findings To Fix

### High: Object-Level Authorization Gaps

Several routes accept `articleId` or `feedId` and act on the global row without
verifying that the current user is subscribed to the feed or owns the relevant
user-level state.

Affected areas:

- `packages/backend/src/services/article.service.ts`
- `packages/backend/src/routes/articles.routes.ts`
- `packages/backend/src/services/extraction.service.ts`
- `packages/backend/src/services/feed.service.ts`
- `packages/backend/src/routes/feeds.routes.ts`
- `packages/backend/src/services/ai.service.ts`
- `packages/backend/src/services/tag.service.ts`
- `packages/backend/src/services/annotation.service.ts`
- `packages/backend/src/mcp/server.ts`

Why it matters:

Any authenticated user who learns or guesses an article/feed UUID may be able to
read, mutate, re-extract, tag, summarize, or refresh data outside their own
subscriptions. Public share routes can also make article IDs easier to leak.

Required fix:

- Add shared authorization helpers for article/feed access.
- Ensure read and write operations only work on feeds the user is subscribed to.
- Return 404 or 403 consistently for inaccessible resources.
- Apply the same checks to REST routes and MCP tools.
- Require auth for share-data lookup, and only return share data for articles
  the current user can access.
- Add regression tests for cross-user access.

### High: Stored XSS Through Feed And Extracted Article HTML

Feed HTML and extracted article HTML are persisted and later rendered with
`dangerouslySetInnerHTML`.

Affected areas:

- `packages/backend/src/services/feed.service.ts`
- `packages/backend/src/services/extraction.service.ts`
- `packages/backend/src/lib/content-extractor.ts`
- `packages/frontend/src/components/articles/AnnotatedContent.tsx`
- `packages/frontend/src/stores/auth.store.ts`

Why it matters:

RSS and extracted web content are untrusted. A malicious feed item could execute
script in the frontend. Because access and refresh tokens are persisted in
browser storage, stored XSS can become account takeover.

Required fix:

- Sanitize article HTML before storing or before rendering.
- Prefer server-side sanitization so all consumers receive safe HTML.
- Keep a tight allowlist for article tags and attributes.
- Remove script/event handlers, inline JavaScript URLs, iframes, and dangerous
  embeds.
- Consider moving refresh tokens to secure HTTP-only cookies in a later auth
  hardening pass.
- Add tests with malicious feed/extracted HTML fixtures.

### Medium: Production Image Does Not Serve The Frontend

The Dockerfile builds and copies the frontend dist directory, and the frontend
client assumes same-origin `/api/v1`, but the Fastify app only registers API,
MCP, and health routes.

Affected areas:

- `Dockerfile`
- `packages/backend/src/app.ts`
- `packages/frontend/src/api/client.ts`
- `DEPLOYMENT.md`

Why it matters:

The documented "single Docker image" deployment currently starts the API but
does not serve the React app. Production would need an undocumented separate
static host or reverse-proxy rule.

Required fix:

- Serve `packages/frontend/dist` from the Fastify production app.
- Add an SPA fallback to `index.html` for non-API routes.
- Keep `/api`, `/mcp`, `/metrics`, and health routes handled by the backend.
- Update deployment docs to describe the one-image deployment.

### Medium: Refresh Token Verification Scans Every Token

Refresh token verification selects every refresh token and bcrypt-compares until
it finds a match.

Affected areas:

- `packages/backend/src/services/auth.service.ts`
- `packages/backend/src/db/schema/users.ts`

Why it matters:

This is fine for a single user, but it scales poorly and expired tokens are not
cleaned up. On a tiny VM, this can become unnecessary CPU and database load.

Required fix:

- Store a cheap lookup identifier or SHA-256 digest alongside the bcrypt hash.
- Query by that lookup value before bcrypt comparison.
- Delete expired tokens opportunistically during refresh.
- Add an index for the lookup value and expiry.
- Add tests for valid, invalid, rotated, and expired refresh tokens.

## Recommended Infrastructure

### Best Zero-Cost Option

Oracle Cloud Always Free can run this shape for USD 0 if capacity is available:

- Ampere A1 VM resources.
- Block storage within the Always Free allowance.
- Docker Compose with app, Postgres, and Redis.
- Caddy for TLS.

Risks:

- Free capacity can be unavailable.
- Idle resources can be reclaimed.
- Operational support is weaker than a paid VM.

Use this for personal/best-effort production where outages are acceptable.

### Best Low-Cost Reliable Option

Use one small paid VM, preferably ARM if available:

- 1-2 vCPU.
- 2 GB RAM preferred; 1 GB is workable for a very small personal instance.
- 20-40 GB SSD.
- Docker Compose.
- Caddy on host.
- Daily encrypted `pg_dump` backup to cheap object storage or another machine.

Suggested runtime shape:

- `app`: single container, `PROCESS_ROLE=all`, serves API, MCP, workers, and FE.
- `postgres`: local Postgres volume.
- `redis`: local Redis volume.
- `caddy`: host service proxying HTTPS to `127.0.0.1:3000`.

Why not split services yet:

The code supports separate `web` and `worker` services, but for the smallest
bill, one app process is acceptable. Split web/worker later if feed refresh or
content extraction starts affecting request latency.

### Platforms To Avoid For This Budget

- Railway: convenient, but the free allowance is too small for this stack and
  the paid tier starts charging quickly once Postgres/Redis are included.
- Fly.io with managed Postgres: good platform, but managed Postgres pushes the
  bill well above the target.
- Render/Railway-style app platforms: useful for ease, weaker for "nothing is
  best" because the app needs persistent Postgres plus Redis plus workers.

## Fix Workstreams

### Workstream 1: Authorization

Goal:

Ensure all article/feed operations are scoped to the current user.

Ownership:

- `packages/backend/src/services/article.service.ts`
- `packages/backend/src/services/feed.service.ts`
- `packages/backend/src/services/ai.service.ts`
- `packages/backend/src/services/tag.service.ts`
- `packages/backend/src/services/annotation.service.ts`
- `packages/backend/src/services/extraction.service.ts`
- `packages/backend/src/routes/*.routes.ts` where needed
- `packages/backend/src/mcp/server.ts`

Expected output:

- Shared access helpers.
- Updated services/routes/MCP tools.
- Regression tests if the repo has a test harness, or a documented test gap if
  it does not.

Implemented:

- Added `access-control.service.ts` for feed, article, tag, and annotation
  checks.
- Scoped article, feed, AI, tag, annotation, share, and MCP operations.
- Kept background workers able to refresh global feeds without a user context.

### Workstream 2: HTML Sanitization

Goal:

Prevent stored XSS from feed and extracted article content.

Ownership:

- `packages/backend/src/lib/content-extractor.ts`
- `packages/backend/src/services/feed.service.ts`
- `packages/backend/src/services/extraction.service.ts`
- Backend package dependencies if needed.

Expected output:

- Sanitization helper.
- Sanitized stored article HTML.
- Tests or fixtures covering script tags, event handlers, `javascript:` URLs,
  and unsafe embeds.

Implemented:

- Added server-side HTML sanitization for feed and extracted article content.
- Sanitized stored and returned HTML plus article image URLs.
- Applied sanitizer in the content extraction worker.

### Workstream 3: Frontend Packaging

Goal:

Make the single Docker image serve the built React app in production.

Ownership:

- `packages/backend/src/app.ts`
- `Dockerfile`
- `docker-compose.prod.yml`
- `DEPLOYMENT.md`

Expected output:

- Fastify static serving for frontend assets.
- SPA fallback.
- Updated deployment docs.
- Build verification.

Implemented:

- Fastify now serves `packages/frontend/dist` when present.
- Browser routes fall back to `index.html` while backend routes stay
  backend-owned.
- Production Compose now runs a single low-cost `app` service with
  `PROCESS_ROLE=all`.

### Workstream 4: Refresh Token Lookup

Goal:

Remove the O(n) refresh token scan and add cleanup/indexing.

Ownership:

- `packages/backend/src/services/auth.service.ts`
- `packages/backend/src/db/schema/users.ts`
- Drizzle migrations.

Expected output:

- Token lookup column or digest column.
- Migration.
- Efficient verification query.
- Expired-token cleanup.
- Auth refresh regression tests if available.

Implemented:

- Added `token_digest` with a unique index.
- Refresh verification now queries by digest before bcrypt comparison.
- Expired refresh tokens are deleted opportunistically.
- Migration deletes existing refresh tokens because digests cannot be recovered
  from existing bcrypt hashes.

## Production Readiness Checklist

Before public production:

- Run the production migration.
- Set `REGISTRATION_MODE=invite` unless public signup is intentional.
- Generate strong secrets for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and
  `ENCRYPTION_KEY`.
- Change default Postgres credentials.
- Put the app behind HTTPS.
- Configure daily database backups.
- Run dependency audit.

Good enough for personal private production:

- Single VM.
- Single app container with `PROCESS_ROLE=all`.
- Local Postgres and Redis.
- Caddy TLS.
- Invite-only registration.
- Daily backup.

## References

- Oracle Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle compute pricing: https://www.oracle.com/cloud/price-list/#pricing-compute
- Hetzner Cloud pricing: https://www.hetzner.com/cloud/private-cloud/
- Railway pricing: https://docs.railway.com/pricing
- Fly.io pricing: https://fly.io/docs/about/pricing/
- Fly Managed Postgres: https://fly.io/docs/mpg/
