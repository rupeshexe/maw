FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/policy-engine/package.json packages/policy-engine/package.json
COPY packages/receipt-kit/package.json packages/receipt-kit/package.json
COPY packages/payment-adapters/package.json packages/payment-adapters/package.json
RUN npm ci --workspace @maw/api --include-workspace-root --ignore-scripts
COPY apps/api apps/api
COPY packages packages
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma && npx tsx apps/api/src/server.ts"]
