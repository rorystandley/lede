#!/usr/bin/env bash
#
# Daily Postgres backup for lede.
#
# Dumps the Postgres database out of its Docker container, compresses it,
# optionally encrypts it with GPG, optionally copies it off-site to S3, and
# prunes local backups older than RETENTION_DAYS.
#
# Designed to be run from cron (see BACKUP.md). Safe to run by hand too.
#
# Everything is configurable via environment variables — the defaults match the
# checked-in docker-compose setup, so on a standard deployment you can run it
# with no configuration at all.
#
#   LEDE_DIR         Project directory containing the compose files.
#                    Default: the repo root (one level up from this script).
#   DOCKER_COMPOSE   Compose command + files.
#                    Default: "docker compose -f docker-compose.yml -f docker-compose.prod.yml"
#   POSTGRES_SERVICE Compose service name for Postgres.  Default: postgres
#   POSTGRES_USER    Postgres user.                      Default: newsreader
#   POSTGRES_DB      Database name.                       Default: newsreader
#   BACKUP_DIR       Where dumps are written.             Default: /var/backups/lede
#   RETENTION_DAYS   Delete local dumps older than this.  Default: 30
#   GPG_RECIPIENT    If set, encrypt the dump for this GPG recipient.
#   S3_DEST          If set (e.g. s3://bucket/lede), upload the dump with `aws s3 cp`.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LEDE_DIR="${LEDE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-newsreader}"
POSTGRES_DB="${POSTGRES_DB:-newsreader}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lede}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"
S3_DEST="${S3_DEST:-}"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
[ -n "$GPG_RECIPIENT" ] && ! command -v gpg >/dev/null 2>&1 && die "GPG_RECIPIENT set but gpg not found"
[ -n "$S3_DEST" ] && ! command -v aws >/dev/null 2>&1 && die "S3_DEST set but aws CLI not found"

cd "$LEDE_DIR" || die "cannot cd to LEDE_DIR=$LEDE_DIR"
mkdir -p "$BACKUP_DIR" || die "cannot create BACKUP_DIR=$BACKUP_DIR"

timestamp="$(date -u '+%Y%m%d-%H%M%S')"
suffix=".sql.gz"
[ -n "$GPG_RECIPIENT" ] && suffix="${suffix}.gpg"
final="$BACKUP_DIR/lede-$timestamp$suffix"
tmp="$final.partial"

# Clean up a half-written dump if anything below fails.
trap 'rm -f "$tmp"' EXIT

log "Dumping database '$POSTGRES_DB' from service '$POSTGRES_SERVICE'"

# pipefail (set above) makes the whole pipeline fail if pg_dump fails, so a
# broken dump never reaches $final — we write to $tmp first and rename on success.
if [ -n "$GPG_RECIPIENT" ]; then
  $DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip \
    | gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" \
    > "$tmp"
  log "Encrypted for GPG recipient '$GPG_RECIPIENT'"
else
  $DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip \
    > "$tmp"
fi

# pipefail above guarantees every stage (pg_dump|gzip|gpg) exited 0, so the dump
# is valid; this is just a last sanity net that something was actually written.
[ -s "$tmp" ] || die "backup file is zero bytes — aborting without overwriting existing backups"
mv "$tmp" "$final"
trap - EXIT

size="$(du -h "$final" | cut -f1)"
log "Wrote $final ($size)"

if [ -n "$S3_DEST" ]; then
  log "Uploading to ${S3_DEST%/}/$(basename "$final")"
  aws s3 cp "$final" "${S3_DEST%/}/$(basename "$final")" \
    || die "S3 upload failed"
  log "Uploaded to S3"
fi

log "Pruning local backups older than $RETENTION_DAYS days"
# -print before -delete lists what it removes; the output is captured by the
# cron/systemd log redirect. Avoids a `| while read` pipeline, which returns
# non-zero at EOF and would trip `set -e` right before we report success.
find "$BACKUP_DIR" -maxdepth 1 -name 'lede-*.sql.gz*' -type f -mtime +"$RETENTION_DAYS" -print -delete

log "Backup complete"
