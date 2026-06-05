#!/bin/bash
# Creates the SELECT-only login role (chatbot_ro) the chatbot uses to query the
# target database — mirrors mcp-servers/scripts/create-readonly-role.sql but
# parameterized for this container (DB name + password from env). Writes are
# impossible at the DB-user level whatever SQL the LLM generates (NFR-01).
# Runs once, on first boot (empty data dir), so the role cannot pre-exist.
set -euo pipefail

DB="${POSTGRES_DB:-dvdrental}"
RO_PASSWORD="${CHATBOT_RO_PASSWORD:-ro_password}"

echo "[target-db-init] Creating read-only role 'chatbot_ro' on '$DB' ..."

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$DB" \
  --set=ro_password="$RO_PASSWORD" --set=dbname="$DB" <<'SQL'
CREATE ROLE chatbot_ro LOGIN PASSWORD :'ro_password';

GRANT CONNECT ON DATABASE :"dbname" TO chatbot_ro;
GRANT USAGE ON SCHEMA public TO chatbot_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chatbot_ro;

-- Keep future tables readable too (never writable).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chatbot_ro;

-- Make read-only sticky for every session this role opens.
ALTER ROLE chatbot_ro SET default_transaction_read_only = on;
SQL

echo "[target-db-init] Role 'chatbot_ro' ready."
