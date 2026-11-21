# One container: builds the storefront and serves it from the API.
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
COPY server/src/catalog.ts /app/server/src/catalog.ts
RUN npm run build

FROM node:22-slim AS api
WORKDIR /app/server
COPY server/package*.json server/tsconfig.json ./
RUN npm ci
COPY server/src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app/server
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/web/dist
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY --from=api /app/server/dist ./dist
COPY --from=web /app/web/dist /app/web/dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
