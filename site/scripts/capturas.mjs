#!/usr/bin/env node
// Capturas de tela do site para revisão visual + checagens automáticas (erros no console, rolagem
// horizontal, animações rodando com movimento reduzido, violações de acessibilidade do axe).
// Uso: node scripts/capturas.mjs [--url=http://localhost:5180/] [--so=1440] [--secoes=inicio,custo] [--sem-axe]
// Saída: site/capturas/<largura>-<movimento>/NN-secao.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, padrao) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=') ?? padrao;
const URL_BASE = arg('url', 'http://localhost:5180/');
const HOJE = arg('hoje', '2026-10-19');
const SO = arg('so', null);
const SECOES = arg('secoes', null)?.split(',');
const SEM_AXE = process.argv.includes('--sem-axe');

const VIEWPORTS = [
  { nome: '1440', width: 1440, height: 900 },
  { nome: '390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { nome: '360', width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
].filter((v) => !SO || SO.split(',').includes(v.nome));
const MOVIMENTOS = arg('movimento', 'no-preference,reduce').split(',');
const ALVOS = ['inicio', 'custo', 'painel', 'queda', '[data-folego]', 'dre', 'orcamento', 'cenarios', '[data-simulador] .sim', 'notas', '[data-espiao]', 'dia', 'dia-saldos', 'dia-tarefas', 'ia', 'integracoes', 'seguranca', 'perguntas', 'nao-mexer'];

let falhas = 0;
const falhar = (msg) => {
  falhas++;
  console.log(`FALHA ${msg}`);
};

// Clica de verdade nas telas e confere o que muda (simulador, painel, DRE, orçamento, calculadora, diálogo).
async function interacoes(page, falhar) {
  const ver = async (sel) => {
    await page.locator(sel).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
  };
  const txt = (sel) => page.locator(sel).first().innerText();
  const espera = async (cond, msg) => {
    if (!(await cond())) falhar(`[interação] ${msg}`);
  };
  try {
    await ver('#custo');
    await page.fill('#c-pessoas', '5');
    await espera(async () => (await txt('[data-valor-ano]')) === 'R$ 106 mil', 'calculadora não recalculou (5 pessoas)');
    await espera(async () => (await page.getAttribute('[data-link-custo]', 'href')).includes('106%20mil'), 'link do WhatsApp sem o valor da calculadora');
    await ver('[data-painel]');
    await page.waitForSelector('#p-empresa');
    await page.selectOption('#p-empresa', '3');
    await espera(async () => (await txt('[data-traj-titulo]')).includes('Aurora Varejo'), 'filtro de empresa do painel não mudou o título');
    await ver('[data-dre]');
    await page.click('[data-modo="dv"]');
    await espera(async () => (await txt('[data-th-valor]')) === 'Diferença', 'DRE não trocou para Desvio');
    await page.click('[data-abre="dop"]');
    await espera(async () => (await page.locator('.dre-detalhe li').count()) === 6, 'DRE não abriu os lançamentos');
    await ver('[data-orcamento]');
    await page.click('[data-versao="v1"]');
    await espera(async () => (await page.locator('.orc-tab td.mudou').count()) > 0, 'orçamento não destacou o que mudou na versão');
    await ver('[data-simulador]');
    await page.waitForSelector('[data-preset="stress"]');
    await page.click('[data-preset="stress"]');
    await espera(async () => /zera em/.test(await txt('[data-s-titulo]')), 'simulador: Estresse deveria zerar o caixa');
    await page.click('[data-preset="base"]');
    await espera(async () => /acima do colchão/.test(await txt('[data-s-titulo]')), 'simulador: Orçamento deveria ficar acima do colchão');
    await ver('[data-espiao]');
    await page.waitForSelector('[data-espiao] [data-aba="vinculadas"]');
    await page.waitForFunction(() => !document.querySelector('[data-consultar]').disabled, null, { timeout: 30000 });
    await espera(async () => /Recebidas \(2\)/.test(await txt('[data-espiao] [data-aba="recebidas"]')), 'espião: deveriam sobrar 2 notas em Recebidas');
    await espera(async () => /87\.420,00/.test(await txt('[data-acervo-valor]')), 'espião: acervo deveria somar R$ 87.420,00');
    await page.click('[data-espiao] [data-aba="vinculadas"]');
    await espera(async () => (await page.locator('[data-espiao] tr.nota').count()) === 5, 'espião: aba Vinculadas deveria ter 5 notas');
    await page.click('[data-espiao] [data-aba="canceladas"]');
    await espera(async () => (await page.locator('[data-espiao] tr.nota.cancelada').count()) === 1, 'espião: aba Canceladas deveria ter 1 nota');
    await page.click('[data-consultar]');
    await page.waitForTimeout(500);
    await espera(async () => /Consultando/.test(await txt('[data-status]')), 'espião: Consultar novamente não recomeçou');
    await ver('#nao-mexer');
    await page.waitForTimeout(500);
    await page.click('[data-cancelar]');
    await espera(async () => /#REF!/.test(await txt('[data-dialogo-msg]')), 'diálogo: Cancelar não respondeu');
    await page.evaluate(() => document.querySelector('[data-excluir]').addEventListener('click', (e) => e.preventDefault()));
    await page.click('[data-excluir]');
    await page.waitForTimeout(500);
    await espera(async () => /Nenhuma planilha/.test(await txt('[data-abas-status]')), 'diálogo: Excluir não apagou a última aba');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await espera(async () => (await txt('[data-abas-status]')) === '9 planilhas', 'voltar ao topo não restaurou as abas');
    console.log('ok    interações');
  } catch (e) {
    falhar(`[interação] ${e.message.split(String.fromCharCode(10))[0]}`);
  }
}

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  for (const mov of MOVIMENTOS) {
    const dir = path.join(SITE, 'capturas', `${vp.nome}-${mov === 'reduce' ? 'reduzido' : 'normal'}`);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor || 1, reducedMotion: mov, locale: 'pt-BR' });
    const page = await ctx.newPage();
    const erros = [];
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && erros.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    await page.goto(`${URL_BASE}?hoje=${HOJE}&captura`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    // Abertura em momentos da animação.
    if (mov !== 'reduce' && (!SECOES || SECOES.includes('inicio'))) {
      for (const t of [0.4, 1.3, 2.0]) {
        await page.goto(`${URL_BASE}?hoje=${HOJE}&captura`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(t * 1000);
        await page.screenshot({ path: path.join(dir, `00-abertura-${String(t).replace('.', '_')}s.png`) });
      }
      await page.goto(`${URL_BASE}?hoje=${HOJE}&captura`, { waitUntil: 'networkidle' });
    }
    await page.waitForTimeout(2800);

    let n = 1;
    for (const alvo of ALVOS) {
      if (SECOES && !SECOES.includes(alvo)) continue;
      if (alvo === 'queda') {
        // Palco da queda em três pontos da rolagem.
        const pos = await page.evaluate(() => {
          const st = window.__site?.ScrollTrigger?.getById('queda');
          return st ? { ini: st.start, fim: st.end } : null;
        });
        if (pos) {
          for (const p of [0, 0.5, 1, 1.4]) {
            await page.evaluate((y) => window.scrollTo(0, y), pos.ini + (pos.fim - pos.ini) * p);
            await page.waitForTimeout(1600);
            await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, '0')}-queda-${p}.png`) });
          }
        }
        n++;
        continue;
      }
      const ok = await page.evaluate((id) => {
        const el = /^[[.]/.test(id) ? document.querySelector(id) : document.getElementById(id);
        if (!el) return false;
        el.scrollIntoView({ block: 'start' });
        return true;
      }, alvo);
      if (!ok) {
        falhar(`[${vp.nome}/${mov}] seção #${alvo} não existe`);
        continue;
      }
      await page.waitForTimeout(alvo === 'ia' ? 9000 : 1500);
      await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, '0')}-${alvo.replace(/[^\w-]+/g, '')}.png`) });
      n++;
    }

    // Página inteira (com movimento reduzido mostra tudo no estado final).
    if (mov === 'reduce') await page.screenshot({ path: path.join(dir, `99-pagina-inteira.png`), fullPage: true });

    // Checagens.
    const largura = await page.evaluate((larguraTela) => {
      const largos = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > larguraTela + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed' && !el.closest('.queda__celulas, .heat-wrap, .orc-tab-wrap, .abas__lista, .panel[style*="overflow"]');
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      return { scroll: document.documentElement.scrollWidth, janela: larguraTela, largos };
    }, vp.width);
    const vazam = await page.evaluate(() =>
      [...document.querySelectorAll('h1, h2, h3, .titulo, .subtitulo')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => `"${el.textContent.trim().slice(0, 40)}" (${el.scrollWidth}>${el.clientWidth})`)
    );
    if (vazam.length) falhar(`[${vp.nome}/${mov}] título vazando da coluna: ${vazam.join(' | ')}`);
    if (largura.scroll > largura.janela) falhar(`[${vp.nome}/${mov}] rolagem horizontal: ${largura.scroll} > ${largura.janela} (${largura.largos.join(', ')})`);
    if (mov === 'reduce') {
      const rodando = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length);
      if (rodando) falhar(`[${vp.nome}/${mov}] ${rodando} animação(ões) infinitas rodando com movimento reduzido`);
    }
    if (erros.length) falhar(`[${vp.nome}/${mov}] console:\n  ${erros.join('\n  ')}`);
    if (!SEM_AXE && vp.nome === '1440' && mov === 'no-preference') {
      const { AxeBuilder } = await import('@axe-core/playwright');
      const r = await new AxeBuilder({ page }).exclude('.queda__celulas').analyze();
      for (const v of r.violations) falhar(`[axe] ${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((x) => x.target.join(' ')).join(' | ')}`);
    }
    if (vp.nome === '1440' && mov === 'no-preference' && !SECOES) await interacoes(page, falhar);
    console.log(`ok    ${vp.nome}/${mov} → ${path.relative(SITE, dir)}`);
    await ctx.close();
  }
}
await browser.close();
console.log(falhas ? `\n${falhas} problema(s).` : '\nSem problemas.');
process.exit(falhas ? 1 : 0);
