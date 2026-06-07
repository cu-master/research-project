#!/bin/bash
# Restores the sample dvdrental dataset into the target database on first boot.
# Supply the dump in ./data/dvd-rental/ (mounted at /dvdrental-src):
#   - dvdrental.tar  -> restored with pg_restore (the standard postgresqltutorial dump)
#   - *.sql          -> restored with psql
# If no dump is present we warn and continue (the DB + chatbot_ro role still get
# created, just with no data), so the stack still boots.
set -euo pipefail

DB="${POSTGRES_DB:-dvdrental}"
SRC=/dvdrental-src

if [ -f "$SRC/dvdrental.tar" ]; then
  echo "[target-db-init] Restoring $SRC/dvdrental.tar into '$DB' ..."
  # pg_restore exits non-zero when it ignores benign errors — notably the
  # dvdrental dump's `CREATE SCHEMA public`, which already exists on PG15+.
  # Without the `|| …` guard, `set -e` would abort here and the role-creation
  # script (02-…) that follows would never run, leaving chatbot_ro missing.
  pg_restore -U "$POSTGRES_USER" -d "$DB" --no-owner --no-privileges "$SRC/dvdrental.tar" \
    || echo "[target-db-init] pg_restore finished with ignored errors (continuing)."
elif ls "$SRC"/*.sql >/dev/null 2>&1; then
  for f in "$SRC"/*.sql; do
    echo "[target-db-init] Loading $f into '$DB' ..."
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DB" -f "$f"
  done
else
  echo "[target-db-init] WARNING: no dump found in $SRC (expected dvdrental.tar or *.sql)."
  echo "[target-db-init] Skipping data load — '$DB' will be empty. See docs to add the dump."
fi
