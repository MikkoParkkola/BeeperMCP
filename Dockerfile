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

# create unprivileged user for tenant isolation
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN groupadd -g $GROUP_ID app && \
    useradd -u $USER_ID -g app -s /bin/sh -m appuser

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/mcp-tools.js ./
COPY --from=build /app/utils.js ./
RUN HUSKY=0 npm ci --omit=dev && \
    mkdir -p mx-cache room-logs && \
    chown -R appuser:app ./

VOLUME ["/app/mx-cache", "/app/room-logs"]
USER appuser

EXPOSE 3000 8757
CMD ["node", "dist/server.js"]
