# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ curl ca-certificates pkg-config libssl-dev rustc cargo \
    && rm -rf /var/lib/apt/lists/* \
    && HUSKY=0 npm ci

# gosu isn't packaged for bookworm, so download a pinned release
ENV GOSU_VERSION=1.17
RUN curl -fsSL -o /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/${GOSU_VERSION}/gosu-$(dpkg --print-architecture)" \
    && chmod +x /usr/local/bin/gosu
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Pin gosu to a known working version to avoid unexpected breakages
COPY --from=build /usr/local/bin/gosu /usr/local/bin/gosu
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/mcp-tools.js ./
COPY --from=build --chown=node:node /app/utils.js ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
RUN mkdir -p mx-cache room-logs \
    && chown -R node:node mx-cache room-logs
RUN apt-get update \
    && apt-get install -y gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app .

RUN mv docker-entrypoint.sh /docker-entrypoint.sh \
    && chown root:root /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh

USER node

VOLUME ["/app/mx-cache", "/app/room-logs"]

EXPOSE 3000 8757
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/beeper-mcp-server.js"]
