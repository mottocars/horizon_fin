# --- build ---
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Produção: a página e a API no mesmo domínio (api.horizonhub.com.br); o Nginx do host entrega
# /v1/ para o backend. Os endereços ficam fixados no build (Vite).
ARG VITE_API_BASE=/v1
ARG VITE_API_URL_PUBLICA=https://api.horizonhub.com.br/v1
ARG VITE_APP_URL=https://financas.horizonhub.com.br
ENV VITE_API_BASE=$VITE_API_BASE VITE_API_URL_PUBLICA=$VITE_API_URL_PUBLICA VITE_APP_URL=$VITE_APP_URL

RUN npm run build

# --- serve ---
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
