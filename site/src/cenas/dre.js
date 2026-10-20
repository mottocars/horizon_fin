// DRE gerencial: tabela com a cascata dentro das linhas (da receita ao lucro), Realizado / Orçado / Desvio,
// e os lançamentos de cada linha num clique.
import { brl, lbl, pct } from '../motor/modelo.js';
import { dreDemo } from '../dados/dre-demo.js';
import { barraJanela, esc, lateralJanela } from '../nucleo/dom.js';
import { gsap, reduzir } from '../nucleo/movimento.js';
import { registrarCena } from '../nucleo/cenas.js';

const COR = { mais: '#2a78d6', menos: '#e34948', sub: '#1d5c8a', fim: '#13202a', bom: '#0ca30c', ruim: '#d03b3b' };
const dd = (n, mes) => `${String(n).padStart(2, '0')}/${mes.slice(5, 7)}`;

export function montarDre(raiz, { hoje }) {
  const dre = dreDemo(hoje);
  let modo = 'r';
  let aberta = null;
  let animou = false;

  raiz.innerHTML = `${barraJanela(['Dashboards', 'Econômico Financeiro', 'Demonstração do Resultado'])}
  <div class="janela__corpo">
    ${lateralJanela(1)}
    <div class="mock">
      <div class="mock__cab">
        <h3 class="mock__titulo">Demonstração do Resultado</h3>
        <span class="mock__sub">Grupo Aurora · ${esc(lbl(dre.mes))}</span>
        <span class="carimbo">Fechada em 01/${hoje.slice(5, 7)} às 06:12</span>
      </div>
      <div class="controls">
        <div class="ctl">
          <span class="rot" id="d-modo">Mostrar</span>
          <div class="seg" role="group" aria-labelledby="d-modo">
            <button type="button" data-modo="r" aria-pressed="true">Realizado</button>
            <button type="button" data-modo="o" aria-pressed="false">Orçado</button>
            <button type="button" data-modo="dv" aria-pressed="false">Desvio</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <table class="dre-tab">
          <thead><tr>
            <th scope="col">Linha</th>
            <th scope="col" class="col-barra"><span class="visualmente-oculto">Cascata</span></th>
            <th scope="col" data-th-valor>Realizado</th>
            <th scope="col" class="col-pct" data-th-pct>% receita</th>
            <th scope="col">vs. orçado</th>
          </tr></thead>
          <tbody data-linhas></tbody>
        </table>
        <p class="note">Clique numa linha para ver os lançamentos que formam o número.</p>
      </div>
    </div>
  </div>`;

  const corpo = raiz.querySelector('[data-linhas]');

  function barra(l, escala) {
    if (modo === 'dv') {
      const dif = l.r - l.o;
      const larg = Math.min(48, (Math.abs(dif) / escala) * 48 * 6);
      const esq = dif >= 0 ? 50 : 50 - larg;
      return `<i style="left:${esq}%;width:${larg}%;background:${dif >= 0 ? COR.bom : COR.ruim}"></i><b class="centro"></b>`;
    }
    return `<i style="left:${(Math.min(l.a, l.b) / escala) * 100}%;width:${(Math.abs(l.b - l.a) / escala) * 100}%;background:${COR[l.tipo]}"></i>`;
  }

  function desenhar() {
    // Cascata: cada linha começa onde a anterior terminou; subtotais saem do zero.
    let acum = 0;
    const linhas = dre.linhas.map((l) => {
      const v = l[modo === 'dv' ? 'r' : modo];
      let a = 0;
      let b = v;
      if (l.tipo === 'mais') acum = v;
      else if (l.tipo === 'menos') {
        a = acum;
        b = acum + v;
        acum = b;
      } else b = acum;
      return { ...l, a, b };
    });
    const escala = Math.max(...linhas.map((l) => Math.max(Math.abs(l.a), Math.abs(l.b)))) * 1.02;
    const receita = dre.receita[modo === 'o' ? 'o' : 'r'];
    raiz.querySelector('[data-th-valor]').textContent = modo === 'r' ? 'Realizado' : modo === 'o' ? 'Orçado' : 'Diferença';
    raiz.querySelector('[data-th-pct]').textContent = modo === 'dv' ? 'Orçado' : '% receita';
    corpo.innerHTML = linhas
      .map((l, i) => {
        const dif = l.r - l.o;
        const dv = l.o ? (l.r / l.o - 1) * 100 : 0;
        const bom = dif >= 0;
        const valor = modo === 'dv' ? brl(dif, true) : brl(l[modo]);
        const pctCol = modo === 'dv' ? brl(l.o) : pct((l[modo] / receita) * 100);
        const nome = l.lanc.length
          ? `<button type="button" class="linha" aria-expanded="${aberta === l.id}" aria-controls="dre-det-${l.id}" data-abre="${l.id}"><span>${esc(l.nome)}</span><span aria-hidden="true">›</span></button>`
          : `<span class="linha linha--fixa">${esc(l.nome)}</span>`;
        const det =
          l.lanc.length && aberta === l.id
            ? `<tr class="det" id="dre-det-${l.id}"><td colspan="5"><div class="dre-detalhe">
                <div class="dre-detalhe__cab"><b>${esc(l.nome)} · ${esc(lbl(dre.mes))}</b><button type="button" data-abre="${l.id}">Fechar</button></div>
                <ol>${l.lanc.map(([d, h, v]) => `<li><span class="num">${dd(d, dre.mes)}</span><span>${esc(h)}</span><span class="num">${esc(brl(v))}</span></li>`).join('')}</ol>
              </div></td></tr>`
            : '';
        return `<tr class="${l.tipo === 'sub' ? 'sub' : l.tipo === 'fim' ? 'fim' : ''}">
          <td>${nome}</td>
          <td class="col-barra"><span class="dre-barra" data-i="${i}">${barra(l, modo === 'dv' ? dre.receita.o : escala)}</span></td>
          <td class="val">${esc(valor)}</td>
          <td class="val col-pct">${esc(pctCol)}</td>
          <td class="val ${bom ? 'dv-bom' : 'dv-ruim'}">${esc(pct(dv, true))}</td>
        </tr>${det}`;
      })
      .join('');
  }

  raiz.addEventListener('click', (e) => {
    const m = e.target.closest('[data-modo]');
    if (m) {
      modo = m.dataset.modo;
      raiz.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b === m)));
      desenhar();
      if (!reduzir()) gsap.from(corpo.querySelectorAll('.dre-barra i'), { scaleX: 0, transformOrigin: modo === 'dv' ? '50% 50%' : '0 50%', duration: 0.45, stagger: 0.03, ease: 'power2.out' });
      return;
    }
    const a = e.target.closest('[data-abre]');
    if (a) {
      aberta = aberta === a.dataset.abre ? null : a.dataset.abre;
      desenhar();
      corpo.querySelector(`[data-abre="${a.dataset.abre}"]`)?.focus();
    }
  });

  desenhar();
  registrarCena(raiz, {
    entrar() {
      if (animou || reduzir()) return;
      animou = true;
      gsap.from(corpo.querySelectorAll('.dre-barra i'), { scaleX: 0, transformOrigin: '0 50%', duration: 0.55, stagger: 0.07, ease: 'power2.out', delay: 0.15 });
    },
  });
}
