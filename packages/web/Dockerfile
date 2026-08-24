# Build context is the repo root — see docker-compose.yml.

FROM node:24-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /workspace
COPY . .
# The API's real URL for this deployment — bake at build time, same as any Vite env var.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npx nx build web --skip-nx-cache

FROM nginx:alpine AS runtime
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/packages/web/dist /usr/share/nginx/html
EXPOSE 80
