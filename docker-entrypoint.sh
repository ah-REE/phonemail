#!/bin/sh
# PhoneMail app entrypoint.
# Runs on every container start, BEFORE the Next.js server comes up.
set -e

echo "[entrypoint] applying database migrations (prisma migrate deploy)"
/app/node_modules/.bin/prisma migrate deploy

echo "[entrypoint] starting application: $*"
exec "$@"
