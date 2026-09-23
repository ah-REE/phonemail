# PhoneMail SMTP service image.
#
# Built from the same base as the app so no extra registry image is required.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./server.mjs
COPY README.md ./README.md

# Run unprivileged: port 25 inside the container is bound by the image user, and
# the Compose network is the only thing that can reach it.
RUN groupadd --system --gid 1001 smtp \
 && useradd --system --uid 1001 --gid smtp smtp \
 && chown -R smtp:smtp /app
USER smtp

EXPOSE 25
CMD ["node", "server.mjs"]
