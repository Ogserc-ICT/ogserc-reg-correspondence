# OGSERC Registry: production image (docs/OPERATIONS.md).
# Build:  docker build -t ogserc-registry .
# Run:    see docker-compose.prod.yml. On start it applies pending database
#         migrations, then starts the server on port 3000.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall generates the Prisma client into src/generated.
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Africa/Lagos \
    PORT=3000
# pg_dump / pg_restore for scripts/backup-db.sh when run inside the container.
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/assets ./assets
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/seed-data.json /app/tsconfig.json ./
USER node
EXPOSE 3000
# Migrations are forward-only; take a backup before deploying a new version.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT}"]
