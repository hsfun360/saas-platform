# --- Stage 1: build the Angular app ---
FROM node:20-slim AS build
WORKDIR /app

# Install deps first (better layer caching). Build needs devDependencies (Angular
# CLI / build tooling), so NOT --omit=dev.
COPY package*.json ./
RUN npm install

# Build the production bundle. The @angular/build:application builder outputs to
# dist/Login/browser. environment.ts already points at the live API URL.
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
EXPOSE 8080
# (Default nginx entrypoint handles envsubst + launches nginx.)
