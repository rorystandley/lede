# Backup & Restore

How to back up lede data and restore it. Two things to back up: the Postgres database (everything) and the Redis data (transient — optional).

## What's in the database

| Data | Backup priority |
|------|----------------|
| Users, passwords, API keys | Critical |
| Feed subscriptions, folders, tags | Critical |
| Articles, read states, annotations | Important (re-fetchable from feeds, but read state would be lost) |
| Rules | Important |
| Digests | Nice-to-have (rebuilt next morning) |
| Reading stats | Important |
| AI usage log | Nice-to-have (historical only) |

Redis holds BullMQ queue state. Loss is acceptable — pending jobs just don't run. The next refresh cycle picks up where things left off.

## Backup Strategy

Backups use [restic](https://restic.net/). It handles encryption, deduplication, compression, and retention itself, and it's a single static binary with no daemon. The key thing for a self-hosted setup: **you choose where the backups go.** A restic repository can live on:

- a local path or attached disk,
- **SFTP to another machine you control** (a home NAS, a Raspberry Pi, a second VPS) — fully self-hosted, no third party,
- any S3-compatible object store, including a self-hosted [MinIO](https://min.io/).

Nothing here assumes a particular cloud provider.

### One-time setup

Install restic (`apt install restic`, `brew install restic`, or grab the binary from the [releases page](https://github.com/restic/restic/releases)), then choose a repository and a password.

```bash
# Pick ONE repository location:
export RESTIC_REPOSITORY=sftp:backups@nas.local:/srv/lede-backups   # your own box over SSH
# export RESTIC_REPOSITORY=/mnt/external/lede-backups               # a local/attached disk
# export RESTIC_REPOSITORY=s3:https://minio.example.com/lede        # self-hosted MinIO / any S3-compatible

# Store the encryption password in a file readable only by root.
# WITHOUT THIS PASSWORD THE BACKUPS CANNOT BE DECRYPTED — keep a copy somewhere safe.
sudo install -m 600 /dev/stdin /etc/lede/restic-password <<< "$(openssl rand -base64 32)"
export RESTIC_PASSWORD_FILE=/etc/lede/restic-password

# Initialise the repository once.
restic init
```

### The backup script

The repo ships [`scripts/backup.sh`](./scripts/backup.sh). It dumps the database out of the Postgres container, verifies the dump, hands it to restic as a snapshot, and applies retention. With `RESTIC_REPOSITORY` and the password set, it needs no other configuration.

```bash
RESTIC_REPOSITORY=sftp:backups@nas.local:/srv/lede-backups \
RESTIC_PASSWORD_FILE=/etc/lede/restic-password \
./scripts/backup.sh
```

It dumps to a temporary file and only snapshots it once `pg_dump` has succeeded, so a failed dump never becomes a snapshot of partial data. Tunables (all optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `KEEP_DAILY` | `7` | Daily snapshots to keep |
| `KEEP_WEEKLY` | `4` | Weekly snapshots to keep |
| `KEEP_MONTHLY` | `6` | Monthly snapshots to keep |
| `LEDE_DIR` | repo root | Project dir with the compose files |
| `POSTGRES_USER` / `POSTGRES_DB` | `newsreader` | Override if you changed the defaults |

restic deduplicates, so daily snapshots of a slowly-changing database cost very little extra space.

### Schedule it

A systemd timer is the tidiest option. Put the restic settings in an environment file readable only by root:

`/etc/lede/backup.env`:

```ini
RESTIC_REPOSITORY=sftp:backups@nas.local:/srv/lede-backups
RESTIC_PASSWORD_FILE=/etc/lede/restic-password
```

`/etc/systemd/system/lede-backup.service`:

```ini
[Unit]
Description=lede database backup
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/lede
EnvironmentFile=/etc/lede/backup.env
ExecStart=/opt/lede/scripts/backup.sh
```

`/etc/systemd/system/lede-backup.timer`:

```ini
[Unit]
Description=Run lede database backup daily

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now lede-backup.timer
```

Prefer cron? Same idea:

```cron
0 3 * * * cd /opt/lede && set -a && . /etc/lede/backup.env && ./scripts/backup.sh >> /var/log/lede-backup.log 2>&1
```

## Restore

List what you've got:

```bash
restic snapshots --tag lede
```

### With the restore script

[`scripts/restore.sh`](./scripts/restore.sh) is the counterpart to the backup script. It drops and recreates the database, then loads a snapshot (the latest by default):

```bash
# Restore the most recent snapshot
./scripts/restore.sh

# Restore a specific snapshot
./scripts/restore.sh 1a2b3c4d
```

It asks you to confirm before dropping the database (type the database name). Pass `--force` to skip the prompt — handy for the automated restore drill below.

### By hand

```bash
# Stop the app to avoid concurrent writes
docker compose stop app

# Stream a snapshot straight from restic into psql
restic dump latest lede-newsreader.sql \
  | docker compose exec -T postgres psql -U newsreader postgres \
      -c "DROP DATABASE IF EXISTS newsreader;" -c "CREATE DATABASE newsreader;"
restic dump latest lede-newsreader.sql \
  | docker compose exec -T postgres psql -U newsreader newsreader

docker compose start app
```

### Smoke test after restore

```bash
# Health check
curl http://localhost:3000/api/health

# Counts
docker compose exec postgres psql -U newsreader newsreader -c \
  "SELECT 'users' AS table, count(*) FROM users UNION ALL
   SELECT 'feeds', count(*) FROM feeds UNION ALL
   SELECT 'articles', count(*) FROM articles;"
```

Log in via the UI and verify your feeds and articles are present.

## OPML as a secondary backup

The Settings → OPML Export downloads your feed subscriptions as a portable file. This isn't a full backup (no articles, no read state, no rules), but it lets you reconstruct your feed list anywhere — including importing into another reader if you ever decide to migrate away.

Consider a monthly cron to email yourself the OPML:

```bash
# Personal touch: monthly OPML email
curl -s http://localhost:3000/api/v1/opml/export \
  -H "Authorization: Bearer $API_KEY" \
  | mail -s "lede OPML backup" you@example.com
```

## Disaster recovery checklist

Periodically verify your backups actually work. Schedule a restore drill every quarter:

- [ ] Spin up a fresh VPS or local Docker environment
- [ ] Point `RESTIC_REPOSITORY`/`RESTIC_PASSWORD_FILE` at your repo
- [ ] Restore it: `./scripts/restore.sh latest --force`
- [ ] Log in with a known account
- [ ] Verify feeds, articles, settings are intact
- [ ] Tear down the test environment

If the restore drill fails, fix the backup process before you actually need it. `restic check` also verifies repository integrity without a full restore.

## Point-in-time recovery (optional)

restic gives you daily snapshots, which is plenty for a personal deployment. If you ever need to recover to an exact moment rather than the last snapshot, look at continuous WAL archiving with [pgBackRest](https://pgbackrest.org/) — it's production-grade but overkill for most self-hosted setups.
