// Plugin do site: monta o index.html a partir das seções (src/secoes/*.html) e preenche os marcadores.
//   <!-- @incluir secoes/x.html -->   conteúdo de src/secoes/x.html (pode incluir outras)
//   {{WHATSAPP:contexto}}             link wa.me com a mensagem pronta do contexto (config.js)
//   {{APP_URL}} {{SITE_URL}} {{ANO}}  endereço do sistema, do site, ano corrente
//   {{ROBOTS}}                        meta robots (noindex fora do lançamento)
// Também injeta o preload da fonte, gera robots.txt e sitemap.xml e avisa se o WhatsApp ainda é placeholder.
import fs from 'node:fs';
import path from 'node:path';
import { APP_URL, linkWhatsApp, ORGANIZACAO, WHATSAPP, WHATSAPP_PLACEHOLDER } from '../config.js';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

function incluir(html, profundidade = 0) {
  if (profundidade > 5) throw new Error('plugin-site: inclusão recursiva demais');
  return html.replace(/<!--\s*@incluir\s+([\w/.-]+)\s*-->/g, (_, rel) => {
    const arq = path.join(SRC, rel);
    if (!fs.existsSync(arq)) throw new Error(`plugin-site: não achei ${rel}`);
    return incluir(fs.readFileSync(arq, 'utf8'), profundidade + 1);
  });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export default function pluginSite({ base, siteUrl, indexar }) {
  let modo = 'serve';
  const preencher = (html) =>
    html
      .replace(/\{\{WHATSAPP(?::(\w+))?\}\}/g, (_, ctx) => esc(linkWhatsApp(ctx || 'padrao')))
      .replace(/\{\{APP_URL\}\}/g, esc(APP_URL))
      .replace(/\{\{SITE_URL\}\}/g, esc(siteUrl))
      .replace(/\{\{ANO\}\}/g, String(new Date().getFullYear()))
      .replace(/\{\{ORGANIZACAO\}\}/g, esc(ORGANIZACAO.nome))
      .replace(
        /\{\{ROBOTS\}\}/g,
        indexar ? '<meta name="robots" content="index, follow" />' : '<meta name="robots" content="noindex, nofollow" />'
      );

  // Preload da fonte de marca (o arquivo latin do Archivo variável, com hash) — precisa do bundle pronto.
  const posBuild = {
    name: 'horizon-site:preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const fonte = Object.keys(ctx.bundle || {}).find((f) => /archivo-latin-wdth-normal-[\w-]+\.woff2$/.test(f));
        if (!fonte) return html;
        return html.replace('</title>', `</title>\n    <link rel="preload" href="${base}${fonte}" as="font" type="font/woff2" crossorigin />`);
      },
    },
  };

  const principal = {
    name: 'horizon-site',
    configResolved(cfg) {
      modo = cfg.command;
    },
    buildStart() {
      if (modo !== 'build') return;
      if (WHATSAPP.numero === WHATSAPP_PLACEHOLDER) {
        this.warn('WhatsApp ainda é o placeholder (site/config.js) — informe o número antes de publicar.');
      }
      if (!indexar) this.warn(`Build sem indexação (noindex) para ${siteUrl} — use VITE_INDEXAR=true só no lançamento.`);
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return preencher(incluir(html));
      },
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: indexar ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',
      });
      if (indexar) {
        const hoje = new Date().toISOString().slice(0, 10);
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc><lastmod>${hoje}</lastmod></url>\n</urlset>\n`,
        });
      }
    },
    // Editar uma seção recarrega a página no dev.
    configureServer(server) {
      const dir = path.join(SRC, 'secoes');
      server.watcher.add(dir);
      server.watcher.on('change', (arq) => {
        if (path.resolve(arq).startsWith(dir)) server.ws.send({ type: 'full-reload' });
      });
    },
  };

  return [principal, posBuild];
}
