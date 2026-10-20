import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import pluginSite from './vite/plugin-site.js';

// Endereço do site (ver plano): pré-lançamento em financas.horizonhub.com.br/site (padrão), lançamento em
// www.horizonhub.com.br com VITE_BASE=/ VITE_SITE_URL=https://www.horizonhub.com.br VITE_INDEXAR=true.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const base = env.VITE_BASE || '/site/';
  const siteUrl = (env.VITE_SITE_URL || 'https://financas.horizonhub.com.br/site').replace(/\/$/, '');
  const indexar = env.VITE_INDEXAR === 'true';
  return {
    base,
    plugins: [pluginSite({ base, siteUrl, indexar })],
    server: { port: 5180, strictPort: true, host: true },
    preview: { port: 4180, strictPort: true, host: true },
    build: {
      target: 'es2022',
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'index.html'), 404: resolve(import.meta.dirname, '404.html') },
      },
    },
  };
});
