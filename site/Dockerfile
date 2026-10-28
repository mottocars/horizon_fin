# --- build ---
FROM node:22-alpine AS build

WORKDIR /app

# O Playwright (devDependency das capturas de tela) não precisa de navegador no build da imagem.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Endereço do site, fixado no build (Vite): raiz de https://horizonhub.com.br. A indexação (VITE_INDEXAR=true)
# vem do docker-compose.yml — sem ela, o build sai com noindex.
ARG VITE_BASE=/
ARG VITE_SITE_URL=https://horizonhub.com.br
ARG VITE_INDEXAR=
ENV VITE_BASE=$VITE_BASE VITE_SITE_URL=$VITE_SITE_URL VITE_INDEXAR=$VITE_INDEXAR

# O prebuild confere a história do Grupo Aurora no motor (a cópia do motor já vem commitada em src/motor).
RUN npm run build

# --- serve ---
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
