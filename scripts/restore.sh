#!/usr/bin/env bash
#
# Restore a lede Postgres backup from restic (see scripts/backup.sh).
#
# Usage:
#   scripts/restore.sh [snapshot] [--force]
#
# `snapshot` is a restic snapshot ID, or "latest" (the default). List available
# snapshots with:
#   RESTIC_REPOSITORY=... RESTIC_PASSWORD_FILE=... restic snapshots --tag lede
#
# By default this is DESTRUCTIVE: it drops and recreates the target database
# before loading the dump, and asks you to confirm. Pass --force to skip the
# prompt (useful for automated restore drills).
#
# Uses the same restic env vars as backup.sh: RESTIC_REPOSITORY and
# RESTIC_PASSWORD / RESTIC_PASSWORD_FILE, plus the optional LEDE_DIR,
# DOCKER_COMPOSE, POSTGRES_SERVICE, POSTGRES_USER, POSTGRES_DB.
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

SNAPSHOT="latest"
FORCE="no"
for arg in "$@"; do
  case "$arg" in
    --force) FORCE="yes" ;;
    -*) die "unknown option: $arg" ;;
    *) SNAPSHOT="$arg" ;;
  esac
done

command -v restic >/dev/null 2>&1 || die "restic not found on PATH"
command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
[ -n "${RESTIC_REPOSITORY:-}" ] || die "RESTIC_REPOSITORY is not set"
[ -n "${RESTIC_PASSWORD:-}" ] || [ -n "${RESTIC_PASSWORD_FILE:-}" ] \
  || die "set RESTIC_PASSWORD or RESTIC_PASSWORD_FILE"

cd "$LEDE_DIR" || die "cannot cd to LEDE_DIR=$LEDE_DIR"

if [ "$FORCE" != "yes" ]; then
  printf 'This will DROP and recreate database "%s" and load restic snapshot "%s".\nType the database name to continue: ' \
    "$POSTGRES_DB" "$SNAPSHOT"
  read -r reply
  [ "$reply" = "$POSTGRES_DB" ] || die "aborted"
fi

log "Recreating database '$POSTGRES_DB'"
$DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" \
  -c "CREATE DATABASE \"$POSTGRES_DB\";"

log "Restoring from restic snapshot '$SNAPSHOT'"
# restic dump streams the stored file to stdout; pipe it straight into psql.
# pipefail (set above) surfaces a failure in either stage.
restic dump "$SNAPSHOT" "lede-${POSTGRES_DB}.sql" \
  | $DOCKER_COMPOSE exec -T "$POSTGRES_SERVICE" psql -U "$POSTGRES_USER" "$POSTGRES_DB"

log "Restore complete. Verify with: $DOCKER_COMPOSE exec $POSTGRES_SERVICE psql -U $POSTGRES_USER $POSTGRES_DB -c '\\dt'"
