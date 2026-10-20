// Gráficos das telas — porte em SVG puro do frontend/src/pages/Dashboards/EconomicoFinanceiro/fluxo/
// graficos.jsx (Trajetoria): mesma geometria, mesmas cores; desenhados na largura exata do contêiner.
import { brl, eixo, lbl, niceTicks } from '../motor/modelo.js';
import { diaMes } from '../motor/analise.js';
import { esc } from '../nucleo/dom.js';

// Mesmas cores do ganchos.js do app (atributos de SVG não leem var()).
export const COR = {
  ink: '#13202a',
  ink2: '#44525c',
  muted: '#6b7780',
  grid: '#e3e8eb',
  surface: '#fbfcfc',
  surface2: '#f2f5f6',
  accent: '#1d5c8a',
  entrada: '#2a78d6',
  cenario: '#eb6834',
  saida: '#e34948',
  crit: '#d03b3b',
  critInk: '#b42d2d',
};

const caminho = (arr, x, y, a = 0) => arr.map((v, k) => `${k ? 'L' : 'M'}${x(a + k).toFixed(1)},${y(v).toFixed(1)}`).join('');

let seq = 0;

// Trajetória do caixa: realizado (cheio) até hoje, Orçamento (tracejado) e, se houver, o cenário (laranja).
// Devolve o SVG e o que a dica precisa para achar o mês sob o cursor.
export function trajetoria({ D, sc = null, W, ruptura = false }) {
  const id = `tr${++seq}`;
  const meses = [...D.hist, 'hoje', ...D.fut];
  const rot = (i) => (meses[i] === 'hoje' ? `hoje ${diaMes(D.hoje)}` : lbl(meses[i]));
  const base = [...D.saldoHist, D.caixaHoje, ...D.saldoFut];
  const scen = sc ? [...D.saldoHist, D.caixaHoje, ...sc] : base;
  const nh = D.hist.length + 1;
  const n = meses.length;
  const H = W < 560 ? 250 : 320;
  const m = { l: 58, r: 14, t: 16, b: 30 };
  const todos = [...base, ...scen, D.colchao, 0];
  const ymin = Math.min(0, ...todos);
  const ymax = Math.max(...todos) * 1.06 || 1;
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin || 1));
  const xs = Math.max(0, nh - 1);
  const passo = W < 560 ? Math.ceil(n / 6) : Math.ceil(n / 14);
  const igual = !sc || sc.every((v, i) => Math.abs(v - D.saldoFut[i]) < 1);
  const mv = Math.min(...(sc || D.saldoFut));
  const mi = (sc || D.saldoFut).indexOf(mv);
  const bi = nh + D.minIdx;
  const rotX = (i) => Math.min(Math.max(x(i), m.l + 40), W - m.r - 40);
  const furo = sc ? sc.findIndex((v) => v < D.colchao) : -1;

  const p = [];
  for (const v of niceTicks(ymin, ymax, 5)) {
    p.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? COR.ink2 : COR.grid}" stroke-width="1"/>`);
    p.push(`<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(eixo(v))}</text>`);
  }
  p.push(`<rect x="${x(xs)}" y="${m.t}" width="${Math.max(0, x(n - 1) - x(xs))}" height="${H - m.t - m.b}" fill="${COR.surface2}"/>`);
  p.push(`<text x="${x(n - 1) - 6}" y="${m.t + 12}" text-anchor="end">PROJETADO</text>`);
  meses.forEach((mm, i) => {
    if (mm !== 'hoje' && (i % passo || (W < 760 && Math.abs(i - (nh - 1)) < passo * 0.75))) return;
    const hoje = mm === 'hoje' ? ` style="fill:${COR.ink};font-weight:600"` : '';
    p.push(`<text x="${x(i)}" y="${H - 10}" text-anchor="middle"${hoje}>${esc(rot(i))}</text>`);
  });
  p.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(D.colchao)}" y2="${y(D.colchao)}" stroke="${COR.crit}" stroke-width="1.5" stroke-dasharray="2 4"/>`);
  p.push(`<text x="${m.l + 6}" y="${y(D.colchao) - 6}" style="fill:${COR.critInk}">colchão ${esc(eixo(D.colchao))}</text>`);

  // Séries — dentro de um recorte que a cena pode animar (desenho da esquerda para a direita).
  const s = [];
  s.push(`<path d="${caminho(base.slice(0, nh), x, y)}L${x(nh - 1)},${y(ymin)}L${x(0)},${y(ymin)}Z" fill="${COR.entrada}" fill-opacity="0.1"/>`);
  s.push(`<path d="${caminho(base.slice(0, nh), x, y)}" fill="none" stroke="${COR.entrada}" stroke-width="2.5" stroke-linejoin="round"/>`);
  s.push(`<path d="${caminho(base.slice(xs), x, y, xs)}" fill="none" stroke="${COR.entrada}" stroke-width="2" stroke-dasharray="6 4"/>`);
  if (!igual) s.push(`<path d="${caminho(scen.slice(xs), x, y, xs)}" fill="none" stroke="${COR.cenario}" stroke-width="2.5" stroke-linejoin="round"/>`);
  s.push(`<circle cx="${x(nh - 1)}" cy="${y(base[nh - 1])}" r="4.5" fill="${COR.entrada}" stroke="${COR.surface}" stroke-width="2"/>`);
  s.push(`<text x="${rotX(nh - 1)}" y="${y(base[nh - 1]) - 12}" text-anchor="middle" class="val">hoje ${esc(eixo(base[nh - 1]))}</text>`);
  s.push(`<circle cx="${x(bi)}" cy="${y(base[bi])}" r="4.5" fill="${COR.entrada}" stroke="${COR.surface}" stroke-width="2"/>`);
  s.push(`<text x="${rotX(bi)}" y="${y(base[bi]) - 12}" text-anchor="middle" class="val">${esc(eixo(base[bi]))}</text>`);
  if (!igual) {
    s.push(`<circle cx="${x(nh + mi)}" cy="${y(mv)}" r="4.5" fill="${COR.cenario}" stroke="${COR.surface}" stroke-width="2"/>`);
    s.push(`<text x="${rotX(nh + mi)}" y="${y(mv) + 18}" text-anchor="middle" class="val" style="fill:${COR.cenario}">${esc(eixo(mv))}</text>`);
  }
  if (ruptura && !igual && furo >= 0) {
    const xr = x(nh + furo);
    const lado = xr > W * 0.7 ? 'end' : 'start';
    const dx = lado === 'end' ? -8 : 8;
    s.push(`<line x1="${xr}" x2="${xr}" y1="${m.t}" y2="${H - m.b}" stroke="${COR.critInk}" stroke-width="1.5"/>`);
    s.push(`<circle cx="${xr}" cy="${y(sc[furo])}" r="5.5" fill="#fff" stroke="${COR.critInk}" stroke-width="2.5"/>`);
    s.push(`<text x="${xr + dx}" y="${m.t + 30}" text-anchor="${lado}" class="lbl" style="fill:${COR.critInk}">ponto de ruptura: ${esc(lbl(D.fut[furo]))}</text>`);
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Saldo de caixa no fim de cada mês">
    <defs><clipPath id="${id}"><rect data-revelar x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>
    ${p.join('')}
    <g clip-path="url(#${id})">${s.join('')}</g>
    <line data-cursor x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="${COR.ink2}" stroke-width="1" opacity="0"/>
    <rect data-area x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>
  </svg>`;

  // Para a dica: mês sob o cursor e o que mostrar.
  const dica = (i) => {
    const titulo = meses[i] === 'hoje' ? `Hoje, ${diaMes(D.hoje)}` : `Fim de ${lbl(meses[i])}`;
    const linhas =
      i < nh
        ? [['Realizado', brl(base[i])]]
        : [
            ['Orçamento', brl(base[i])],
            ...(igual ? [] : [['Cenário', brl(scen[i])]]),
            [i === nh ? 'A acontecer até o fim do mês' : 'Resultado do mês', brl(D.resFut[i - nh], true)],
          ];
    return { titulo, linhas };
  };
  return { svg, W, H, n, m, x, dica };
}

// Liga a dica (tooltip) e a linha de cursor a um gráfico já inserido no contêiner `.chart`.
export function ligarDica(chart, g) {
  const svg = chart.querySelector('svg');
  const area = svg?.querySelector('[data-area]');
  const cursor = svg?.querySelector('[data-cursor]');
  if (!area) return;
  let dica = chart.querySelector('.dica');
  if (!dica) {
    dica = document.createElement('div');
    dica.className = 'dica';
    dica.setAttribute('aria-hidden', 'true');
    chart.appendChild(dica);
  }
  const esconder = () => {
    dica.classList.remove('visivel');
    cursor.setAttribute('opacity', '0');
  };
  area.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const escala = r.width / g.W;
    const px = (ev.clientX - r.left) / escala;
    const i = Math.max(0, Math.min(g.n - 1, Math.round(((px - g.m.l) / (g.W - g.m.l - g.m.r)) * (g.n - 1))));
    const { titulo, linhas } = g.dica(i);
    dica.innerHTML = `<b>${esc(titulo)}</b>${linhas.map(([k, v]) => `<span><i>${esc(k)}</i>${esc(v)}</span>`).join('')}`;
    const cx = g.x(i);
    cursor.setAttribute('x1', cx);
    cursor.setAttribute('x2', cx);
    cursor.setAttribute('opacity', '0.5');
    const esquerda = cx * escala > r.width / 2;
    dica.style.left = `${cx * escala + (esquerda ? -12 : 12)}px`;
    dica.style.top = `${(ev.clientY - r.top) | 0}px`;
    dica.classList.toggle('esq', esquerda);
    dica.classList.add('visivel');
  });
  area.addEventListener('pointerleave', esconder);
}

// Cor de uma célula do mapa de calor (regra do `cel` de secoes.jsx).
export function corCelula(v, maxAbs) {
  if (Math.abs(v) < 1) return 'background:var(--surface-2);color:var(--muted)';
  // No app vai até 90% com texto branco; aqui para em 78% com texto escuro, para o contraste passar no AA.
  const p = Math.round(12 + 66 * Math.sqrt(Math.min(1, Math.abs(v) / maxAbs)));
  return `background:color-mix(in srgb, var(${v < 0 ? '--s-out' : '--s-in'}) ${p}%, var(--surface));color:var(--ink)`;
}
