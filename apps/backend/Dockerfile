# Production image for the AURA API. Build from the repository root:
#   docker build -f apps/backend/Dockerfile -t aura-api .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/backend/prisma apps/backend/prisma
RUN npm ci --workspace @aura/shared --workspace @aura/backend --include-workspace-root --ignore-scripts \
 && npx --workspace @aura/backend prisma generate
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm run build -w @aura/shared && npm run build -w @aura/backend

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
USER node
EXPOSE 4000
CMD ["sh", "-c", "cd apps/backend && npx prisma migrate deploy && node dist/index.js"]
