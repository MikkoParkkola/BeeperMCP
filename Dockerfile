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

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/mcp-tools.js ./
COPY --from=build --chown=node:node /app/utils.js ./
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER node
RUN HUSKY=0 npm ci --omit=dev && mkdir -p mx-cache room-logs
USER root

VOLUME ["/app/mx-cache", "/app/room-logs"]

EXPOSE 3000 8757
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/beeper-mcp-server.js"]
