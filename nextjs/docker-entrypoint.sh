#!/bin/sh
set -e

# Sync the Prisma schema to the metadata database. There is no migrations folder,
# so we use `db push` (schema-only sync) rather than `migrate deploy`.
# --skip-generate: the client was already generated at build time.
echo "[entrypoint] Syncing Prisma schema to \$DATABASE_URL ..."
node node_modules/prisma/build/index.js db push --skip-generate

echo "[entrypoint] Starting Next.js server ..."
exec "$@"
