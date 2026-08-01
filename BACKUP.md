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

### The shipped backup script (recommended)

The repo ships [`scripts/backup.sh`](./scripts/backup.sh), which does the whole
job: dump the database out of the Postgres container, gzip it, optionally
GPG-encrypt it, optionally copy it off-site to S3, and prune old local dumps. On
a standard deployment it needs no configuration — the defaults match the
checked-in `docker-compose` files.

```bash
# From the project directory (e.g. /opt/lede)
./scripts/backup.sh
```

Everything is tunable via environment variables (see the header of the script
for the full list). The common ones:

| Variable | Default | Purpose |
|----------|---------|---------|
| `BACKUP_DIR` | `/var/backups/lede` | Where dumps are written |
| `RETENTION_DAYS` | `30` | Delete local dumps older than this |
| `GPG_RECIPIENT` | _(unset)_ | If set, encrypt the dump for this GPG recipient |
| `S3_DEST` | _(unset)_ | If set (e.g. `s3://bucket/lede`), upload with `aws s3 cp` |
| `LEDE_DIR` | repo root | Project dir containing the compose files |

The script writes to a `.partial` file and only renames it into place once the
dump succeeds, so a failed run never leaves a truncated backup that looks valid,
and never deletes a good one.

#### Schedule it with cron

Run it every morning at 03:00 and log the output:

```cron
# crontab -e  (as the user that can run docker)
0 3 * * * GPG_RECIPIENT=backup@yourdomain.com S3_DEST=s3://your-backup-bucket/lede \
  /opt/lede/scripts/backup.sh >> /var/log/lede-backup.log 2>&1
```

#### Or with a systemd timer

`/etc/systemd/system/lede-backup.service`:

```ini
[Unit]
Description=lede database backup
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/lede
Environment=GPG_RECIPIENT=backup@yourdomain.com
Environment=S3_DEST=s3://your-backup-bucket/lede
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

The rest of this section explains what the script does under the hood, in case
you want to adapt it or run the pieces by hand.

### Daily pg_dump to local disk

Quick and dirty for a personal deployment:

```bash
# /etc/cron.daily/lede-backup
#!/bin/bash
set -e
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/var/backups/lede
mkdir -p "$BACKUP_DIR"

docker compose -f /opt/lede/docker-compose.yml exec -T postgres \
  pg_dump -U newsreader newsreader \
  | gzip > "$BACKUP_DIR/lede-$TIMESTAMP.sql.gz"

# Keep 30 days
find "$BACKUP_DIR" -name 'lede-*.sql.gz' -mtime +30 -delete
```

```bash
sudo chmod +x /etc/cron.daily/lede-backup
```

### Off-site backup to S3 or compatible

The risk with local-only backups is the same VPS dying. Push to S3, Backblaze B2 (cheaper), or any S3-compatible store.

```bash
# /etc/cron.daily/lede-backup
#!/bin/bash
set -e
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

docker compose -f /opt/lede/docker-compose.yml exec -T postgres \
  pg_dump -U newsreader newsreader \
  | gzip \
  | gpg --encrypt --recipient backup@yourdomain.com \
  | aws s3 cp - s3://your-backup-bucket/lede/$TIMESTAMP.sql.gz.gpg
```

Use `--storage-class STANDARD_IA` or `INTELLIGENT_TIERING` to cut storage costs.

Cost for ~50 MB dumps × 30 days × S3 Standard-IA = ~$0.02/mo. Backblaze B2 is cheaper still.

### Encrypted with GPG

The pipe through `gpg --encrypt` above means the backup is encrypted at rest. You need the private key to restore. Export the public key once:

```bash
gpg --export --armor backup@yourdomain.com > /opt/lede/backup-pubkey.asc
```

Store the private key somewhere safe and separate (1Password, a USB stick in a drawer, etc.) — without it the backups are useless.

### Continuous backup via WAL archiving

For larger deployments, consider continuous WAL archiving to recover to a specific point in time:

- [pgBackRest](https://pgbackrest.org/) — production-grade
- Managed Postgres (DigitalOcean, RDS, etc.) handles this automatically

This is overkill for personal use. Daily snapshots are fine.

## Restore

### The shipped restore script (recommended)

[`scripts/restore.sh`](./scripts/restore.sh) is the counterpart to the backup
script. It handles both plain and GPG-encrypted dumps, drops and recreates the
database, and loads the dump:

```bash
# Plain dump
./scripts/restore.sh /var/backups/lede/lede-20260101-030000.sql.gz

# Encrypted dump (decrypted with your local GPG private key)
./scripts/restore.sh /var/backups/lede/lede-20260101-030000.sql.gz.gpg
```

It asks you to confirm before dropping the database (type the database name).
Pass `--force` to skip the prompt — handy for the automated restore drill below.

The manual steps below do the same thing by hand if you'd rather not use the
script.

### From a local pg_dump

```bash
# Stop the app to avoid concurrent writes
docker compose stop app

# Drop and recreate the database (destructive!)
docker compose exec postgres psql -U newsreader -c "DROP DATABASE newsreader;"
docker compose exec postgres psql -U newsreader -c "CREATE DATABASE newsreader;"

# Restore
gunzip -c /var/backups/lede/lede-20260101-030000.sql.gz \
  | docker compose exec -T postgres psql -U newsreader newsreader

# Restart
docker compose start app
```

### From an encrypted S3 backup

```bash
aws s3 cp s3://your-backup-bucket/lede/20260101-030000.sql.gz.gpg - \
  | gpg --decrypt \
  | gunzip \
  | docker compose exec -T postgres psql -U newsreader newsreader
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
- [ ] Download the latest encrypted backup
- [ ] Restore it: `./scripts/restore.sh <backup-file> --force` (decrypts and loads in one step)
- [ ] Log in with a known account
- [ ] Verify feeds, articles, settings are intact
- [ ] Tear down the test environment

If the restore drill fails, fix the backup process before you actually need it.

## Postgres tuning for backup performance

For dumps larger than a few hundred MB, parallel dump speeds things up:

```bash
docker compose exec postgres pg_dump -U newsreader -j 4 -Fd newsreader -f /tmp/dump
docker compose cp postgres:/tmp/dump ./dump
tar czf lede.tar.gz dump
```

`-Fd` (directory format) + `-j 4` runs four parallel workers. Restore with `pg_restore -j 4`.

For most deployments this is unnecessary — `pg_dump | gzip` over the default plain format is fine up to several GB.
