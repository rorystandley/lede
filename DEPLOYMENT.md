# Deployment

How to run News Reader in production. Three concrete paths, in increasing order of complexity.

## Option 1: VPS with Docker Compose (Recommended)

The simplest and cheapest production setup. Works on any Linux VPS with 1 GB RAM minimum.

### Provision

Get a VPS from Hetzner (€4/mo CX11), DigitalOcean ($6/mo Basic), Linode ($5/mo Nanode), or any provider. Pick a region close to your readers.

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out + back in
```

### Pull and configure

```bash
git clone <repo> /opt/news-reader
cd /opt/news-reader
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY to random strings
openssl rand -hex 32  # use for each secret
```

### Build and start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` (create it):

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://newsreader:newsreader@postgres:5432/newsreader
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
    depends_on:
      - postgres
      - redis
    ports:
      - "127.0.0.1:3000:3000"
```

The app listens on `127.0.0.1:3000` — public traffic is handled by Caddy below.

### Reverse proxy: Caddy with automatic TLS

```bash
sudo apt install caddy
```

`/etc/caddy/Caddyfile`:

```
news.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

```bash
sudo systemctl reload caddy
```

Caddy automatically obtains a Let's Encrypt certificate. Visit `https://news.yourdomain.com`.

### Migrations

Run once after first deploy and after every update:

```bash
docker compose exec app node packages/backend/dist/db/migrate.js
```

### Updates

```bash
cd /opt/news-reader
git pull
docker compose up -d --build
docker compose exec app node packages/backend/dist/db/migrate.js
```

## Option 2: Fly.io

Good for global multi-region or if you don't want to manage a VPS.

`fly.toml`:

```toml
app = "news-reader"
primary_region = "lhr"

[build]

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

```bash
fly launch --no-deploy
fly postgres create
fly redis create
fly secrets set JWT_SECRET=... JWT_REFRESH_SECRET=... ENCRYPTION_KEY=...
fly deploy
fly ssh console -C "node packages/backend/dist/db/migrate.js"
```

Cost: ~$5–10/mo with shared CPU, Fly Postgres, Upstash Redis.

## Option 3: Railway / Render / Coolify

Click-to-deploy platforms. Connect the GitHub repo and they'll detect the Dockerfile and build. Add Postgres + Redis services. Set environment variables.

Cost: $5–20/mo depending on plan.

## Environment Variables

Required:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | JWT signing key (≥32 random bytes) |
| `JWT_REFRESH_SECRET` | Refresh token signing key (≥32 random bytes) |
| `ENCRYPTION_KEY` | AES-256-CBC key for encrypting AI API keys (≥32 random bytes) |

Optional:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` |
| `LOG_LEVEL` | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |
| `REGISTRATION_MODE` | `open` | `open` or `invite` |

## Health Checks

`GET /api/health` returns `{"status":"ok"}`. Wire it up to your platform's health probe.

## Logs

Backend uses [pino](https://github.com/pinojs/pino) structured JSON logs. Pipe to your log aggregator:

```bash
docker compose logs -f app | pino-pretty
```

## Scaling

For a single user or small team, the default setup handles tens of thousands of articles per day on a 1 GB VPS without issue. For larger workloads, see [COSTS.md](./COSTS.md) for sizing guidance and [SECURITY.md](./SECURITY.md) for multi-instance considerations.
