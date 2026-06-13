# lede API — Postman collection

A Postman collection covering the full lede backend API, plus a ready-to-use local environment.

| File | What it is |
| --- | --- |
| [`lede.postman_collection.json`](lede.postman_collection.json) | All endpoints, grouped by resource, with example bodies and query params. |
| [`lede.local.postman_environment.json`](lede.local.postman_environment.json) | An environment pre-pointed at `http://localhost:3000`. |

## Import

1. Open Postman → **Import** → drop in both JSON files.
2. Top-right environment selector → choose **lede - Local**.
3. If your server runs elsewhere, edit the `baseUrl` variable (e.g. `https://reader.example.com`).

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
- The collection is generated to match the routes in `packages/backend/src/routes/*`. If you add or change an endpoint, update the collection to match.
