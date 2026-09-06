FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS dependencies
WORKDIR /app
COPY deploy/cloud-run/package.json deploy/cloud-run/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY deploy/cloud-run/package.json ./
COPY tsconfig.json ./
COPY src/server/book-analysis ./src/server/book-analysis
COPY src/server/providers ./src/server/providers
COPY src/shared ./src/shared
COPY scripts/cloud-run-book.ts ./scripts/cloud-run-book.ts
USER node
ENTRYPOINT ["node", "--import", "tsx", "scripts/cloud-run-book.ts"]
