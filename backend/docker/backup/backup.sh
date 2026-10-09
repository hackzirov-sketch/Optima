#!/bin/sh
# Periodic logical backup of the primary Postgres into a second database.
#
# Every BACKUP_INTERVAL_HOURS:
#   1. pg_dump the primary (custom format) into BACKUP_DIR and check the file
#      is a readable archive;
#   2. restore it into a *fresh* database on the backup server, then swap it
#      in by renaming — the backup database is never half-restored, and if
#      anything fails the previous copy stays as it was;
#   3. delete dump files older than BACKUP_KEEP_DAYS.
#
# The dump files are the point-in-time history (they keep last week's data
# even after a bad DELETE reaches the backup database on the next run); the
# second database is a ready-to-use copy you can point the app at.
#
# Environment:
#   SOURCE_DATABASE_URL     primary, e.g. postgresql://upz:pw@postgres:5432/upz
#   BACKUP_PGHOST / BACKUP_PGPORT / BACKUP_PGUSER / BACKUP_PGPASSWORD
#   BACKUP_PGDATABASE       name of the copy on the backup server (default upz)
#   BACKUP_INTERVAL_HOURS   default 6
#   BACKUP_KEEP_DAYS        default 7
#   BACKUP_DIR              default /backups
#   BACKUP_RUN_ONCE=1       take one backup and exit (cron / manual use)
set -eu

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${BACKUP_PGHOST:?BACKUP_PGHOST is required}"
: "${BACKUP_PGUSER:?BACKUP_PGUSER is required}"
: "${BACKUP_PGPASSWORD:?BACKUP_PGPASSWORD is required}"
BACKUP_PGPORT="${BACKUP_PGPORT:-5432}"
BACKUP_PGDATABASE="${BACKUP_PGDATABASE:-upz}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
DIR="${BACKUP_DIR:-/backups}"

mkdir -p "$DIR"

log() { echo "[db-backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# psql/pg_restore against the backup server; $1 = database name.
backup_db() {
  db="$1"; shift
  PGPASSWORD="$BACKUP_PGPASSWORD" PGOPTIONS="-c client_min_messages=warning" \
    "$@" -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER" -d "$db"
}

wait_for() {
  label="$1"; shift
  i=0
  until "$@" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -ge 60 ] && { log "$label not reachable after 5 minutes"; return 1; }
    sleep 5
  done
}

run_once() {
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  out="$DIR/upz-$ts.dump"
  tmp="$DIR/.upz-$ts.dump.partial"
  staging="${BACKUP_PGDATABASE}_restore"
  previous="${BACKUP_PGDATABASE}_previous"

  log "dumping primary → $out"
  pg_dump --format=custom --compress=6 --no-owner --no-privileges \
    --dbname="$SOURCE_DATABASE_URL" --file="$tmp"
  pg_restore --list "$tmp" >/dev/null   # a truncated/corrupt archive fails here
  mv "$tmp" "$out"

  log "restoring into $BACKUP_PGHOST/$staging"
  backup_db postgres psql -v ON_ERROR_STOP=1 -q \
    -c "DROP DATABASE IF EXISTS \"$staging\" WITH (FORCE)" \
    -c "CREATE DATABASE \"$staging\""
  backup_db "$staging" pg_restore --no-owner --no-privileges --exit-on-error "$out"

  # Swap the fresh copy in. Readers of the old copy are disconnected; the
  # whole switch is two renames, so the copy is never seen half-restored.
  backup_db postgres psql -v ON_ERROR_STOP=1 -q \
    -c "DROP DATABASE IF EXISTS \"$previous\" WITH (FORCE)" \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$BACKUP_PGDATABASE' AND pid <> pg_backend_pid()" \
    -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_database WHERE datname = '$BACKUP_PGDATABASE') THEN EXECUTE 'ALTER DATABASE \"$BACKUP_PGDATABASE\" RENAME TO \"$previous\"'; END IF; END \$\$" \
    -c "ALTER DATABASE \"$staging\" RENAME TO \"$BACKUP_PGDATABASE\"" \
    -c "DROP DATABASE IF EXISTS \"$previous\" WITH (FORCE)" >/dev/null

  find "$DIR" -maxdepth 1 -name 'upz-*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[db-backup] pruned /'
  find "$DIR" -maxdepth 1 -name '.upz-*.partial' -mmin +120 -delete
  date -u +%s > "$DIR/LAST_SUCCESS"
  log "ok ($(du -h "$out" | cut -f1))"
}

wait_for "primary" pg_isready -d "$SOURCE_DATABASE_URL"
wait_for "backup server" env PGPASSWORD="$BACKUP_PGPASSWORD" pg_isready -h "$BACKUP_PGHOST" -p "$BACKUP_PGPORT" -U "$BACKUP_PGUSER"

while :; do
  if run_once; then :; else
    date -u +%s > "$DIR/LAST_FAILURE"
    log "FAILED — the previous backup database and dump files are untouched"
    rm -f "$DIR"/.upz-*.partial
  fi
  [ "${BACKUP_RUN_ONCE:-0}" = "1" ] && exit 0
  sleep $((INTERVAL_HOURS * 3600))
done
