#!/bin/sh
# PhoneMail app entrypoint.
# Runs on every container start, BEFORE the Next.js server comes up.
set -e

echo "[entrypoint] applying database migrations (prisma migrate deploy)"

# Postgres images have a first-boot window where pg_isready can pass while init
# is still finishing, so a cold evaluator boot needs a bounded retry here.
attempt=1
max_attempts=5

while true; do
  if /app/node_modules/.bin/prisma migrate deploy; then
    break
  fi

  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] migrations failed after $max_attempts attempts - exiting"
    exit 1
  fi

  echo "[entrypoint] migration attempt $attempt/$max_attempts failed; retrying in 3s"
  attempt=$((attempt + 1))
  sleep 3
done

echo "[entrypoint] starting application: $*"
exec "$@"
