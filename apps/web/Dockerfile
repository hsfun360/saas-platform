# --- Stage 1: build the Angular app ---
FROM node:20-slim AS build
WORKDIR /app

# Install deps first (better layer caching). Build needs devDependencies (Angular
# CLI / build tooling), so NOT --omit=dev.
COPY package*.json ./
RUN npm install

# Build the production bundle. The @angular/build:application builder outputs to
# dist/Login/browser. environment.ts uses a RELATIVE apiUrl ('/api'), so the app
# never names an API host - nginx (or the LB) resolves /api at runtime.
COPY . .
RUN npm run build -- --configuration production

# --- Stage 2: serve the static build with nginx on Cloud Run's $PORT ---
FROM nginx:1.27-alpine AS production

# Site config TEMPLATE. The official nginx image runs envsubst over
# /etc/nginx/templates/*.template at startup, expanding ${PORT} (Cloud Run injects
# PORT; default 8080) into /etc/nginx/conf.d/default.conf before nginx starts.
COPY nginx.conf /etc/nginx/templates/default.conf.template

# The built SPA.
COPY --from=build /app/dist/Login/browser /usr/share/nginx/html

ENV PORT=8080

# API_HOST (the upstream for the nginx /api reverse proxy, see nginx.conf) is
# REQUIRED and deliberately has NO default - it is per-environment, and a wrong
# default silently proxies one environment's API to another's data. This guard
# runs before the envsubst step and aborts startup with an actionable message.
COPY docker-entrypoint.d/05-require-api-host.sh /docker-entrypoint.d/05-require-api-host.sh
RUN chmod +x /docker-entrypoint.d/05-require-api-host.sh

EXPOSE 8080
# (Default nginx entrypoint runs /docker-entrypoint.d/*, then envsubst, then nginx.)
