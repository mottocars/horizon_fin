#!/usr/bin/env node
// Lighthouse (mobile) contra o build: sobe o `vite preview` na 4180 e falha se o desempenho ficar abaixo de 90.
// Navegador: CHROME_PATH, senão o Chrome instalado, senão o Chromium do Playwright (que trava no Lighthouse no
// Windows). Rode `npm run build` antes. A auditoria full-page-screenshot (só a imagem do relatório, sem nota)
// fica de fora: ela estica a janela até a altura da página inteira.
// Uso: node scripts/lighthouse.mjs [--desktop]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const CHROME_WIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const navegador = process.env.CHROME_PATH || (fs.existsSync(CHROME_WIN) ? CHROME_WIN : chromium.executablePath());
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = process.argv.includes('--desktop');
const servidor = await preview({ root: SITE, preview: { port: 4180, strictPort: true } });
const url = 'http://localhost:4180/';
const saida = path.join(SITE, 'capturas', `lighthouse-${desktop ? 'desktop' : 'mobile'}.json`);
fs.mkdirSync(path.dirname(saida), { recursive: true });
try {
  // Assíncrono de propósito: o `vite preview` roda neste mesmo processo e precisa continuar respondendo.
  await new Promise((ok, falha) => {
    const p = spawn(
      'npx',
      ['--yes', 'lighthouse@13.5.0', url, '--quiet', '--output=json', `--output-path="${saida}"`, '--chrome-flags=--headless=new', '--skip-audits=full-page-screenshot', ...(desktop ? ['--preset=desktop'] : [])],
      { stdio: 'inherit', shell: true, env: { ...process.env, CHROME_PATH: navegador } }
    );
    p.on('exit', (c) => (c === 0 ? ok() : falha(new Error(`lighthouse saiu com ${c}`))));
  });
} finally {
  await servidor.close();
}
const r = JSON.parse(fs.readFileSync(saida, 'utf8'));
const nota = (k) => Math.round((r.categories[k]?.score ?? 0) * 100);
const metrica = (k) => r.audits[k]?.displayValue;
console.log(`desempenho ${nota('performance')} · acessibilidade ${nota('accessibility')} · boas práticas ${nota('best-practices')} · SEO ${nota('seo')}`);
console.log(`LCP ${metrica('largest-contentful-paint')} · CLS ${metrica('cumulative-layout-shift')} · TBT ${metrica('total-blocking-time')}`);
process.exit(nota('performance') >= 90 ? 0 : 1);
