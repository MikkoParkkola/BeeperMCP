# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN apt-get update \
    && apt-get install -y python3 make g++ curl pkg-config libssl-dev rustc cargo \
    && rm -rf /var/lib/apt/lists/* \
    && HUSKY=0 npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/mcp-tools.js ./
COPY --from=build --chown=node:node /app/utils.js ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules

USER node
RUN mkdir -p mx-cache room-logs
RUN apt-get update \
    && apt-get install -y gosu \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app .

RUN mv docker-entrypoint.sh /docker-entrypoint.sh \
    && chown root:root /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh \
    && chown node:node mx-cache room-logs

VOLUME ["/app/mx-cache", "/app/room-logs"]

EXPOSE 3000 8757
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/beeper-mcp-server.js"]
