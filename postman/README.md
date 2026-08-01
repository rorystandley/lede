# lede API — Postman collection

A Postman collection covering the full lede backend API, plus a ready-to-use local environment.

| File | What it is |
| --- | --- |
| [`lede.postman_collection.json`](lede.postman_collection.json) | All endpoints, grouped by resource, with example bodies and query params. |
| [`lede.local.postman_environment.json`](lede.local.postman_environment.json) | Environment pre-pointed at `http://localhost:3000`. |
| [`lede.production.postman_environment.json`](lede.production.postman_environment.json) | Environment pre-pointed at `https://news.yourdomain.com`. |

## Import

1. Open Postman → **Import** → drop in the collection and both environment files.
2. Top-right environment selector → choose **lede - Local** or **lede - Production**.
3. If your server runs elsewhere, edit that environment's `baseUrl` variable.

The two environments differ only in `baseUrl`; tokens are stored per-environment, so a Local login won't leak into Production and vice versa.

All endpoints live under `/api/v1` (health checks under `/api`). The interactive Swagger UI is also available at `{{baseUrl}}/api/docs`.

## Authentication

Every request except the public ones sends an `Authorization: Bearer <token>` header. The collection sets this **once at the collection level** to `{{accessToken}}`, so every request inherits it — you never set the header per request.

The backend accepts **two** kinds of bearer token (see `packages/backend/src/plugins/auth.plugin.ts`):

- a **JWT** access token from `POST /auth/login` or `POST /auth/register` — expires after **1 hour**, or
- a long-lived **API key** shaped like `nrk_...`, created via `POST /auth/api-keys`.

Either value works in the same `Authorization: Bearer …` header.

### Option A — JWT (quickest)

1. **Auth → Register** (first time) or **Auth → Login**.
2. The request's **test script** automatically writes `accessToken` and `refreshToken` into the collection variables. Nothing to copy/paste.
3. Call any other request — it's authenticated.
4. After ~1 hour the token expires (`401 Invalid or expired token`). Run **Auth → Refresh Token** (it uses the stored `{{refreshToken}}` and re-saves both tokens).

### Option B — API key (for scripts / long-lived access)

1. Authenticate once with Option A.
2. **Auth → Create API Key** with a `name`. The response includes the raw key **once** — the test script stores it in the `apiKey` variable and logs it to the Postman console.
3. To use it as the bearer token for the whole collection, set `accessToken` to the key value: **Collection → Variables → `accessToken` → Current value →** paste the `nrk_...` (or copy it from `apiKey`). The key doesn't expire unless you set `expiresAt`.

> Tip: API keys are the right choice for `curl`/CI. Example:
> ```bash
> curl -H "Authorization: Bearer nrk_xxx" {{baseUrl}}/api/v1/feeds
> ```

## Chained variables

Some requests save ids so follow-up calls "just work":

- **Subscribe to Feed** → saves `feedId`
- **Create Folder** → saves `folderId`
- **Create Tag** → saves `tagId`

For requests that need an `articleId` (star, extract, annotate, …), grab one from **Articles → List Articles** and set the `articleId` variable.

## Notes

- `refreshInterval` on a feed subscription is in **minutes** (min 1).
- Article list/search filters (`isRead`, `isStarred`, `feedId`, dates, …) are included as **disabled** query params — enable the ones you need.

## Regenerating (don't hand-edit `lede.postman_collection.json`)

The collection is generated from the backend's own OpenAPI spec, so the route
list can't silently drift:

```bash
pnpm gen:postman          # rebuilds the backend, regenerates the collection
pnpm gen:postman:check    # CI mode: no write, exits 1 if out of date / drifted
```

`scripts/generate-postman.mjs` boots the app in-process, reads `app.swagger()`
for the authoritative paths/methods/tags, and merges in the curated example
bodies/query params from the `EXAMPLES` map at the top of that file. It reports
drift two ways: routes missing an example entry, and example entries that no
longer match a route. **CI runs `--check`**, so a PR that adds or renames a
route fails until you run `pnpm gen:postman` and commit the result (and add an
`EXAMPLES` entry for any new write route).

The environment file (`lede.local.postman_environment.json`) is static — edit it by hand.
