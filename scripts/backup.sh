#!/usr/bin/env bash
#
# Daily Postgres backup for lede, using restic.
#
# restic handles encryption, deduplication, compression, and retention itself.
# The backup destination is whatever you point RESTIC_REPOSITORY at — a local
# path, SFTP to a box you control, or any S3-compatible store (including a
# self-hosted MinIO). No specific cloud provider is assumed.
#
# One-time setup (see BACKUP.md for detail):
#   export RESTIC_REPOSITORY=sftp:user@host:/srv/lede-backups
#   export RESTIC_PASSWORD_FILE=/etc/lede/restic-password
#   restic init
#
# Required (restic's own environment variables):
#   RESTIC_REPOSITORY                      Where snapshots are stored.
#   RESTIC_PASSWORD_FILE or RESTIC_PASSWORD  Encryption password.
#
# Optional:
#   LEDE_DIR         Project dir with the compose files. Default: repo root.
#   DOCKER_COMPOSE   Default: "docker compose -f docker-compose.yml -f docker-compose.prod.yml"
#   POSTGRES_SERVICE Default: postgres
#   POSTGRES_USER    Default: newsreader
#   POSTGRES_DB      Default: newsreader
#   RESTIC_TAG       Snapshot tag. Default: lede
#   KEEP_DAILY       Default: 7
#   KEEP_WEEKLY      Default: 4
#   KEEP_MONTHLY     Default: 6
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LEDE_DIR="${LEDE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-newsreader}"
POSTGRES_DB="${POSTGRES_DB:-newsreader}"
RESTIC_TAG="${RESTIC_TAG:-lede}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v restic >/dev/null 2>&1 || die "restic not found on PATH — install it first (see BACKUP.md)"
command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
[ -n "${RESTIC_REPOSITORY:-}" ] || die "RESTIC_REPOSITORY is not set"
[ -n "${RESTIC_PASSWORD:-}" ] || [ -n "${RESTIC_PASSWORD_FILE:-}" ] \
  || die "set RESTIC_PASSWORD or RESTIC_PASSWORD_FILE"

cd "$LEDE_DIR" || die "cannot cd to LEDE_DIR=$LEDE_DIR"

# Dump to a temp file first and verify it before handing it to restic, so a
# failed pg_dump (caught by pipefail) never becomes a snapshot of partial data.
tmp="$(mktemp "${TMPDIR:-/tmp}/lede-backup.XXXXXX.sql")"
trap 'rm -f "$tmp"' EXIT

log "Dumping database '$POSTGRES_DB' from service '$POSTGRES_SERVICE'"
$DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$tmp"
[ -s "$tmp" ] || die "dump is empty — aborting before touching the restic repo"
log "Dump OK ($(du -h "$tmp" | cut -f1))"

# Stream the verified dump into restic under a stable filename so restore is
# predictable regardless of the temp path.
log "Storing snapshot in restic repo"
restic backup --stdin --stdin-filename "lede-${POSTGRES_DB}.sql" \
  --tag "$RESTIC_TAG" --host lede < "$tmp"

log "Applying retention (daily=$KEEP_DAILY weekly=$KEEP_WEEKLY monthly=$KEEP_MONTHLY)"
restic forget --tag "$RESTIC_TAG" \
  --keep-daily "$KEEP_DAILY" \
  --keep-weekly "$KEEP_WEEKLY" \
  --keep-monthly "$KEEP_MONTHLY" \
  --prune

log "Backup complete"
