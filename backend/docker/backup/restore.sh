#!/bin/sh
# Disaster recovery: load a dump file produced by backup.sh into a database.
#
#   docker compose run --rm -e RESTORE_CONFIRM=yes db-backup \
#     /usr/local/bin/restore.sh /backups/upz-20261009T060000Z.dump "$SOURCE_DATABASE_URL"
#
# It REPLACES everything in the target database's public schema, so it only
# runs with RESTORE_CONFIRM=yes. Stop the backend first so nothing writes
# while the restore is in progress.
set -eu
dump="${1:?usage: restore.sh <dump file> <target database url>}"
target="${2:?usage: restore.sh <dump file> <target database url>}"

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "Refusing to overwrite $target without RESTORE_CONFIRM=yes" >&2
  exit 1
fi

pg_restore --list "$dump" >/dev/null
echo "[restore] replacing public schema of target with $dump"
psql "$target" -v ON_ERROR_STOP=1 -q -c "DROP SCHEMA IF EXISTS public CASCADE" -c "CREATE SCHEMA public"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target" "$dump"
echo "[restore] done"
