// Ajudantes de DOM e de texto.
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Texto do motor em partes (string ou { b: 'negrito' }) -> HTML.
export const partes = (ps) => (ps || []).map((p) => (typeof p === 'string' ? esc(p) : `<b>${esc(p.b)}</b>`)).join('');

// Base do site (/site/ no pré-lançamento, / no lançamento) para arquivos de public/.
export const BASE = import.meta.env.BASE_URL;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const mesPorExtenso = (m) => (m ? MESES[+m.slice(5, 7) - 1] : '');
export const dataBR = (iso) => iso.split('-').reverse().join('/');

// Nomes de linhas do motor (máscaras sem acento, em título) -> como uma pessoa escreveria.
const NOMES = {
  'receita de vendas': 'Receita de vendas',
  'custos diretos e mao de obra': 'Custos diretos e mão de obra',
  pessoal: 'Pessoal',
  'despesas administrativas': 'Despesas administrativas',
  'impostos sobre vendas': 'Impostos sobre vendas',
  'logistica e fretes': 'Logística e fretes',
};
export const nomeLinha = (s) => NOMES[String(s).toLowerCase()] || s;

// Moldura das telas do Horizon: barra com símbolo, caminho e usuário; lateral opcional.
export function barraJanela(migalhas, { usuario = true } = {}) {
  const caminho = migalhas.map((m, i) => (i === migalhas.length - 1 ? `<b>${esc(m)}</b>` : `${esc(m)} <i>›</i> `)).join('');
  return `<div class="janela__barra" aria-hidden="true">
    <img class="janela__simbolo" src="${BASE}favicon.svg" width="16" height="20" alt="" />
    <span class="janela__migalhas">${caminho}</span>
    ${usuario ? '<span class="janela__usuario"><span class="so-largo">Juliana Ribeiro</span><span class="janela__avatar">JR</span></span>' : ''}
  </div>`;
}
export const lateralJanela = (ativo = 1) =>
  `<aside class="janela__lateral" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<i${i === ativo ? ' class="ativo"' : ''}></i>`).join('')}</aside>`;
