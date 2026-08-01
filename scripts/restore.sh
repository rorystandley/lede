#!/usr/bin/env bash
#
# Restore a lede Postgres backup produced by scripts/backup.sh.
#
# Handles both plain (.sql.gz) and encrypted (.sql.gz.gpg) dumps — the encrypted
# form is decrypted with your local GPG private key.
#
# Usage:
#   scripts/restore.sh <backup-file> [--force]
#
# By default this is a DESTRUCTIVE operation: it drops and recreates the target
# database before loading the dump. You'll be asked to confirm unless --force is
# passed (useful for automated restore drills).
#
# Environment variables mirror backup.sh:
#   LEDE_DIR, DOCKER_COMPOSE, POSTGRES_SERVICE, POSTGRES_USER, POSTGRES_DB
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LEDE_DIR="${LEDE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-newsreader}"
POSTGRES_DB="${POSTGRES_DB:-newsreader}"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

BACKUP_FILE="${1:-}"
FORCE="no"
[ "${2:-}" = "--force" ] && FORCE="yes"

[ -n "$BACKUP_FILE" ] || die "usage: $0 <backup-file> [--force]"
[ -f "$BACKUP_FILE" ] || die "no such file: $BACKUP_FILE"

case "$BACKUP_FILE" in
  *.gpg) command -v gpg >/dev/null 2>&1 || die "encrypted backup but gpg not found" ;;
esac

cd "$LEDE_DIR" || die "cannot cd to LEDE_DIR=$LEDE_DIR"

if [ "$FORCE" != "yes" ]; then
  printf 'This will DROP and recreate database "%s" and load %s.\nType the database name to continue: ' \
    "$POSTGRES_DB" "$BACKUP_FILE"
  read -r reply
  [ "$reply" = "$POSTGRES_DB" ] || die "aborted"
fi

log "Recreating database '$POSTGRES_DB'"
$DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" \
  -c "CREATE DATABASE \"$POSTGRES_DB\";"

log "Restoring from $BACKUP_FILE"
# Decrypt if needed, then decompress, then feed into psql. pipefail (set above)
# surfaces a failure in any stage.
case "$BACKUP_FILE" in
  *.gpg)
    gpg --batch --quiet --decrypt "$BACKUP_FILE" \
      | gunzip \
      | $DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" "$POSTGRES_DB"
    ;;
  *.gz)
    gunzip -c "$BACKUP_FILE" \
      | $DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" "$POSTGRES_DB"
    ;;
  *)
    die "unrecognised backup extension: expected .sql.gz or .sql.gz.gpg"
    ;;
esac

log "Restore complete. Verify with: $DOCKER_COMPOSE exec $POSTGRES_SERVICE psql -U $POSTGRES_USER $POSTGRES_DB -c '\\dt'"
