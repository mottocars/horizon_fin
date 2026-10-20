# --- build ---
FROM node:22-alpine AS build

WORKDIR /app

# O Playwright (devDependency das capturas de tela) não precisa de navegador no build da imagem.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Endereço do site, fixado no build (Vite): pré-lançamento em financas.horizonhub.com.br/site, sem indexação.
# No lançamento em www.horizonhub.com.br: VITE_BASE=/, VITE_SITE_URL=https://www.horizonhub.com.br,
# VITE_INDEXAR=true (no docker-compose.yml).
ARG VITE_BASE=/site/
ARG VITE_SITE_URL=https://financas.horizonhub.com.br/site
ARG VITE_INDEXAR=
ENV VITE_BASE=$VITE_BASE VITE_SITE_URL=$VITE_SITE_URL VITE_INDEXAR=$VITE_INDEXAR

# O prebuild confere a história do Grupo Aurora no motor (a cópia do motor já vem commitada em src/motor).
RUN npm run build

# --- serve ---
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
