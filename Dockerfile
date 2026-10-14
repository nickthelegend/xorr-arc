# Read-only executor by default. Signing/deployment configuration is separate.
FROM node:24-slim AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY server ./server
COPY shared ./shared
RUN npx tsc -p server/tsconfig.build.json

FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /app/server/dist ./dist
ENV NODE_ENV=production XORR_NETWORK=arc-testnet XORR_DATA_DIR=/data KEEPER=off
RUN mkdir -p /data /deployments && chown node:node /data
COPY deployments ./deployments
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/arc-entrypoint
ENTRYPOINT ["arc-entrypoint"]
EXPOSE 9120
CMD ["node", "dist/server/src/index.js"]
