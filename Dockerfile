# syntax=docker/dockerfile:1

# PhoneMail — production image for the Next.js app (App Router, Node runtime).
#
# Multi-stage:
#   deps       -> full dependency tree (needed to build)
#   builder    -> `prisma generate` + `next build`
#   prod-deps  -> production-only dependency tree (includes the Prisma CLI, so
#                 `prisma migrate deploy` can run in the final image)
#   runner     -> small, non-root runtime image that runs server.mjs
#
# No network access is required at container runtime.

ARG NODE_VERSION=22-bookworm-slim

########## Stage 1: full dependencies ##########
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN npm ci || npm install

########## Stage 2: build ##########
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# A placeholder URL satisfies Prisma's datasource check for generate/build;
# nothing connects to a database during the image build.
ENV DATABASE_URL="postgresql://build:***@localhost:5432/build?schema=public"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build

########## Stage 3: production dependencies ##########
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:***@localhost:5432/build?schema=public"
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# `prisma` and `@prisma/client` live in "dependencies" on purpose: the runtime
# entrypoint needs the CLI, so they must survive --omit=dev.
# (This is why package.json must never move `prisma` to devDependencies.)
RUN npm ci --omit=dev || npm install --omit=dev

# The runner copies node_modules from THIS stage (a fresh install), not from
# builder where generate ran, so the generated client must be produced here.
# It lands in node_modules/.prisma/client and has to exist at runtime; we do
# not rely on postinstall auto-generation. The schema is copied above, so this
# needs no other changes.
RUN npx prisma generate

########## Stage 4: runtime ##########
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# curl is used by the Compose healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder   --chown=nextjs:nodejs /app/.next        ./.next
COPY --from=builder   --chown=nextjs:nodejs /app/prisma       ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --chown=nextjs:nodejs package.json         ./package.json
COPY --chown=nextjs:nodejs next.config.ts       ./next.config.ts
# Custom server: Next + Socket.io share one HTTP listener, so `next start` is
# replaced by `npm run start` -> `node server.mjs`.
COPY --chown=nextjs:nodejs server.mjs           ./server.mjs
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
# A Windows checkout can deliver CRLF (git autocrlf); a CRLF shebang breaks the
# entrypoint inside Linux containers, so normalize defensively before chmod.
RUN sed -i 's/\r$//' ./docker-entrypoint.sh \
 && chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

# The entrypoint applies pending migrations, then execs the CMD.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
