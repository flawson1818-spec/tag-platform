# Build context is the repo root (npm workspaces need every package.json + the root
# lockfile present for `npm ci` to resolve correctly) — see docker-compose.yml.

FROM node:24-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /workspace
COPY . .
RUN npx nx build api --skip-nx-cache

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/api/dist ./packages/api/dist
COPY --from=build /workspace/packages/api/package.json ./packages/api/package.json

EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/api/dist/main.js"]
