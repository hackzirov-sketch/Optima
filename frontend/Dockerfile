# syntax=docker/dockerfile:1

# ---- deps: install all dependencies ----
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --no-audit --no-fund


# ---- build: compile TypeScript + bundle with Vite ----
FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

# VITE_API_URL is intentionally left unset — api.ts defaults to the
# relative "/api/v1", which nginx below reverse-proxies to the backend
# service, keeping frontend and API same-origin from the browser's POV
# (no CORS needed, no per-environment rebuild for the API host).
RUN npm run build


# ---- runner: nginx serving the static build ----
FROM nginx:1.27-alpine AS runner

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
