// A planilha caindo (seção 3): um palco fixo (sticky, não pin — mais estável no iPhone) com o painel do
// Horizon por baixo e uma camada de células por cima. A rolagem derruba as células, uma a uma; quando quase
// todas caíram, o painel conta os números. Aleatoriedade com semente: toda captura de tela sai igual.
import { gsap, reduzir } from '../nucleo/movimento.js';
import { registrarCena } from '../nucleo/cenas.js';
import { esc } from '../nucleo/dom.js';

function gerador(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NUMEROS = ['1.204.330,00', '845.120,77', '3.120.004,51', '2.004.118,00', '9.641.208,77', '412.900,10', '18.330,05', '7.700.000,00', '61.204,88', '1.009.420,00'];
const ERROS = ['#REF!', '#N/D', '#DIV/0!', '#VALOR!', '#REF!'];
const TEXTOS = ['ver com Juliana', 'colar extrato', 'NÃO MEXER', '=SOMA(B2:B9)', 'conferir', 'atualizado?', '12/08', '???'];
const LETRAS = 'ABCDEFGHIJKL';

const topoH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topo-h')) || 64;
const largo = () => window.innerWidth >= 900;

export function montarQueda(raiz, { painel }) {
  const palco = raiz.querySelector('.queda__palco');
  const tela = raiz.querySelector('[data-escala]');
  const camada = raiz.querySelector('[data-celulas]');
  let tl = null;
  let modo = null;

  // Escala do painel para caber no palco (o painel tem 1180px no desktop; no celular, a largura do palco).
  function escalar() {
    const cs = getComputedStyle(palco);
    const pw = palco.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const W = largo() ? 1180 : pw;
    tela.style.setProperty('--tela-w', `${W}px`);
    const h = tela.offsetHeight;
    const fixo = cs.position === 'sticky';
    const ph = palco.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const k = Math.max(0.5, Math.min(1, pw / W, fixo ? ph / h : 1));
    tela.style.setProperty('--k', k.toFixed(4));
    tela.style.marginBottom = `${(h * (k - 1)).toFixed(1)}px`;
  }

  function gerarCelulas() {
    const rnd = gerador(20261019);
    const cols = largo() ? 10 : 5;
    const linhas = largo() ? 15 : 13;
    // A célula grande — a resposta da planilha à pergunta do título.
    const g = largo() ? { c0: 3, c1: 9, l0: 5, l1: 9 } : { c0: 1, c1: 5, l0: 4, l1: 8 };
    camada.style.gridTemplateColumns = `${largo() ? 40 : 30}px repeat(${cols}, minmax(0, 1fr))`;
    camada.style.gridTemplateRows = `24px repeat(${linhas}, minmax(0, 1fr))`;
    const html = ['<span class="queda__cel queda__cel--cab"></span>'];
    for (let c = 0; c < cols; c++) html.push(`<span class="queda__cel queda__cel--cab">${LETRAS[c]}</span>`);
    for (let l = 1; l <= linhas; l++) {
      html.push(`<span class="queda__cel queda__cel--cab">${l}</span>`);
      for (let c = 1; c <= cols; c++) {
        const dentro = c >= g.c0 && c <= g.c1 && l >= g.l0 && l <= g.l1;
        if (dentro) {
          if (c === g.c0 && l === g.l0) {
            html.push(`<span class="queda__cel queda__cel--grande" style="grid-column:${c + 1} / ${g.c1 + 2};grid-row:${l + 1} / ${g.l1 + 2}">
              <code>=SALDO_PROJETADO(MARÇO; TODAS_AS_EMPRESAS)</code><strong>#REF!</strong></span>`);
          }
          continue;
        }
        const r = rnd();
        let cls = 'queda__cel';
        let txt = '';
        if (r < 0.5) txt = NUMEROS[(rnd() * NUMEROS.length) | 0];
        else if (r < 0.64) {
          txt = ERROS[(rnd() * ERROS.length) | 0];
          cls += ' queda__cel--erro';
        } else if (r < 0.76) {
          txt = TEXTOS[(rnd() * TEXTOS.length) | 0];
          cls += ' queda__cel--texto';
        }
        html.push(`<span class="${cls}">${esc(txt)}</span>`);
      }
    }
    camada.innerHTML = html.join('');
  }

  function animar() {
    if (tl) {
      tl.scrollTrigger?.kill();
      tl.kill();
      tl = null;
    }
    gsap.set(camada.children, { clearProps: 'transform' });
    if (reduzir()) return;
    const rnd = gerador(7);
    const queda = palco.clientHeight * 1.15;
    tl = gsap.timeline({
      defaults: { ease: 'power2.in' },
      scrollTrigger: {
        id: 'queda',
        trigger: raiz,
        start: () => `top ${topoH()}px`,
        end: () => `+=${Math.round(window.innerHeight * 1.05)}`,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: (st) => st.progress > 0.78 && painel.revelar(),
      },
    });
    [...camada.children].forEach((c) => {
      const grande = c.classList.contains('queda__cel--grande');
      const t0 = grande ? 0.5 : rnd() * 0.48;
      tl.to(
        c,
        {
          y: queda * (1 + rnd() * 0.5),
          x: (rnd() - 0.5) * (grande ? 60 : 180),
          rotation: (rnd() - 0.5) * (grande ? 24 : 80),
          duration: grande ? 0.5 : 0.38 + rnd() * 0.16,
        },
        t0
      );
    });
  }

  function preparar() {
    const m = `${largo()}|${reduzir()}`;
    escalar();
    if (m === modo) return;
    modo = m;
    gerarCelulas();
    animar();
  }

  new ResizeObserver(() => requestAnimationFrame(escalar)).observe(tela);
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(preparar, 150);
  });
  preparar();

  // Movimento reduzido (ou chegada direto por link): o painel revela assim que aparece.
  registrarCena(palco, {
    entrar: () => {
      if (reduzir()) painel.revelar();
    },
  });
  return { preparar };
}
