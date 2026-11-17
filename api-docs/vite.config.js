import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Documentação pública da API Horizon (api.horizonhub.com.br). Página estática: o Nginx do host
// entrega / para o contêiner deste projeto e /v1/ para o backend (mesmo domínio, sem CORS).
export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 5182, strictPort: true },
  preview: { port: 4182, strictPort: true },
  build: {
    target: 'es2022',
    // Duas páginas: a documentação (/) e o formulário "Quero ser um Parceiro" (/parceiros/).
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        parceiros: resolve(import.meta.dirname, 'parceiros/index.html'),
      },
    },
  },
});
