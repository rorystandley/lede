# Security

This document covers hardening lede for production. The defaults are reasonable for personal use; this guide goes further for shared or public deployments.

## Secrets

### Generate strong secrets

Every production deployment must override the example secrets. Generate fresh values:

```bash
# JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY — each ≥32 random bytes
openssl rand -hex 32
```

Never commit `.env` to git. The `.gitignore` already excludes it.

### Rotating secrets

- **`JWT_SECRET`** — rotating invalidates all access tokens. Users must log in again. Refresh tokens still work via `JWT_REFRESH_SECRET`.
- **`JWT_REFRESH_SECRET`** — rotating logs everyone out completely. Do this if you suspect a leak.
- **`ENCRYPTION_KEY`** — rotating breaks decryption of stored AI API keys. Users will need to re-enter their keys. Don't rotate casually.

To rotate: update `.env`, restart the app, communicate to users.

### Storing secrets

In production, prefer your platform's secrets manager:

- Fly.io: `fly secrets set`
- Railway: project variables (encrypted at rest)
- Kubernetes: Secrets + sealed-secrets controller
- Bare VPS: `.env` file with `chmod 600` ownership by the app user

## Transport Security (HTTPS)

Always run behind TLS in production. The DEPLOYMENT guide shows the Caddy setup, which uses Let's Encrypt automatically. If using nginx/Traefik instead:

```nginx
server {
    listen 443 ssl http2;
    server_name news.yourdomain.com;
    ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Authentication

### Password handling

- Passwords are hashed with bcrypt (12 rounds). Cost is configurable in `auth.service.ts`.
- Minimum password length: 8 characters. Consider increasing to 12 for higher-value deployments.

### JWT lifetimes

- Access token: 1 hour
- Refresh token: 7 days (single-use, rotated on every refresh)

Adjust in `auth.plugin.ts` and `auth.service.ts` if needed.

### Token storage

- **Access token** — short-lived (1 hour) JWT. The SPA keeps it in memory
  (Zustand) and sends it as `Authorization: Bearer …`. Because it expires
  quickly, its blast radius if leaked is small.
- **Refresh token** — the long-lived credential, so it never touches
  JavaScript-reachable storage. The backend delivers it in an **`HttpOnly`,
  `SameSite=Strict`** cookie (`Secure` in production), scoped to the
  `/api/v1/auth` path. `HttpOnly` means an XSS payload cannot read or
  exfiltrate it, which is the whole point — a stolen access token expires in
  an hour, but a stolen refresh token would be a persistent account
  compromise.

Flow:

- `POST /auth/login` and `/auth/register` set the refresh cookie and return
  only the access token in the JSON body.
- `POST /auth/refresh` reads the cookie (no request body), rotates the token
  (issuing a new cookie), and returns a fresh access token. A rejected token
  clears the cookie.
- `POST /auth/logout` revokes the refresh token server-side (deletes the DB
  row) and clears the cookie.

**CSRF:** `SameSite=Strict` is the CSRF defence for the cookie-based refresh
and logout endpoints. The SPA is served same-origin with the API, so its own
`fetch` calls are same-site and unaffected, while a cross-site request can't
carry the cookie. If you ever split the frontend onto a different origin,
revisit this — you'd need `SameSite=None; Secure` plus an explicit CSRF token.

### API keys

API keys are long-lived bearer tokens prefixed with `nrk_`. They're hashed with bcrypt before storage. Each user can create multiple keys and revoke them individually.

**Recommendation:** if an API key is exposed (e.g. in a public commit), revoke it immediately via Settings → API Keys (when that UI lands) or directly via `DELETE /api/v1/auth/api-keys/:keyId`. The `key_prefix` column lets you identify which key was leaked from logs without seeing the full token.

## Rate Limiting

In production (`NODE_ENV=production`), the rate-limit plugin is enabled with a default of 100 requests per minute per user/IP. Tune in `rate-limit.plugin.ts`:

```typescript
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.user?.id ?? req.ip,
});
```

Per-endpoint overrides:

```typescript
app.post('/api/v1/auth/login', {
  config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
});
```

Consider a stricter limit on `/auth/login` and `/auth/register` to mitigate brute-force.

## CSP and Browser Hardening

Add these headers via your reverse proxy (Caddy snippet shown):

```
header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    Referrer-Policy strict-origin-when-cross-origin
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
}
```

A strict CSP requires care because the frontend uses inline styles. The starting point is:

```
Content-Security-Policy: default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self';
```

## Content sanitisation

RSS and extracted article HTML is untrusted, so it's sanitised server-side before it's ever stored or returned. `lib/html-sanitizer.js` (built on `sanitize-html`) runs in the feed ingestion, extraction, and article read paths — it keeps a tight tag/attribute allowlist and strips scripts, event handlers, `javascript:` URLs, iframes, and other dangerous embeds. Image URLs are sanitised too.

The frontend renders the already-sanitised HTML via `dangerouslySetInnerHTML`, so the safety guarantee lives in one place on the server rather than being duplicated across clients (web, API, MCP). If you add a new consumer, read from the article service so you inherit the same sanitisation.

## Database

- The default `docker-compose.yml` uses the placeholder username/password `newsreader/newsreader`. Change these for production and use a strong password (32+ random characters).
- Postgres is not exposed publicly — only the app container talks to it over the internal network. Verify with `ss -tlnp` that 5432 isn't bound to a public interface.
- Enable Postgres SSL if running across a network: `ALTER SYSTEM SET ssl = on;` and update `DATABASE_URL` to include `?sslmode=require`.

## Backups

See [BACKUP.md](./BACKUP.md). A daily encrypted backup to off-site storage protects against accidental deletion and ransomware.

## Dependency Vulnerabilities

Run regularly:

```bash
pnpm audit
pnpm outdated
```

Subscribe to GitHub security advisories or use Dependabot.

For container images: scan with `docker scan` or Trivy in CI.

## Supply chain

- The `pnpm-lock.yaml` pins exact versions. Commit it.
- pnpm verifies package integrity checksums on install. Don't disable this.
- Build the production Docker image from a clean checkout, not a developer machine.

## OWASP Top 10 quick check

| Risk | Status |
|------|--------|
| Broken Access Control | ✅ All routes scoped to `req.user.id` |
| Cryptographic Failures | ✅ Bcrypt for passwords, AES-256-CBC for AI keys, JWT signed |
| Injection | ✅ Drizzle ORM uses parameterised queries; Zod validates all inputs |
| Insecure Design | ✅ Untrusted feed/article HTML sanitised server-side (see above) |
| Security Misconfiguration | ⚠️ Default secrets in `.env.example` — must override |
| Vulnerable Components | ⚠️ Run `pnpm audit` regularly |
| Auth Failures | ✅ Bcrypt, rate-limited, refresh token rotation, HttpOnly refresh cookie |
| Software & Data Integrity | ✅ pnpm checksums, lockfile pinned |
| Logging Failures | ✅ Pino structured logs |
| SSRF | ⚠️ Feed fetcher uses user-supplied URLs — keep `rss-parser` on its latest version |

The remaining `⚠️` items — overriding the example secrets, keeping dependencies patched, and locking down the feed fetcher against SSRF — are the main things to tighten before you go beyond personal use.

## Reporting vulnerabilities

If you find a security issue, please don't open a public issue. Email the maintainer or use GitHub's private vulnerability reporting.
