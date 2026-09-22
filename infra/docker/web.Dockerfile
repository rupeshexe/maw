FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci --workspace @maw/web --include-workspace-root --ignore-scripts
COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/ui packages/ui
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @maw/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@maw/web"]
