# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/mcp-tools.js ./
COPY --from=build /app/utils.js ./
RUN npm ci --omit=dev
EXPOSE 3000 8757
HEALTHCHECK --interval=30s --timeout=3s CMD sh -c "wget -q -O- http://127.0.0.1:8757/.well-known/mcp.json | grep -q '\"transport\"'"
CMD ["node", "dist/beeper-mcp-server.js"]
