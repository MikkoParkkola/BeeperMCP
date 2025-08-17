# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++ \
    && npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# create unprivileged user for tenant isolation
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN addgroup -g $GROUP_ID app && \
    adduser -u $USER_ID -G app -s /bin/sh -D appuser

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/mcp-tools.js ./
COPY --from=build /app/utils.js ./
RUN npm ci --omit=dev && \
    mkdir -p mx-cache room-logs && \
    chown -R appuser:app ./

VOLUME ["/app/mx-cache", "/app/room-logs"]
USER appuser

EXPOSE 3000 8757
CMD ["node", "dist/server.js"]
