// Painel do Fluxo de Caixa (seção 3) e Fôlego de cada empresa — o Grupo Aurora passando pelo motor real.
// Os filtros funcionam de verdade: cada mudança recalcula o D com modelo() e redesenha.
import { brl, curto, eixo, lbl, pct, titulo } from '../motor/modelo.js';
import { tituloTrajetoria } from '../motor/analise.js';
import { cartoesSite, EMPRESAS, folegoSite, obterD } from '../dados/demo-calculado.js';
import { barraJanela, esc, lateralJanela, mesPorExtenso, partes } from '../nucleo/dom.js';
import { observarLargura } from '../nucleo/medida.js';
import { contar } from '../nucleo/contar.js';
import { gsap, recalcular, reduzir } from '../nucleo/movimento.js';
import { registrarCena } from '../nucleo/cenas.js';
import { corCelula, ligarDica, trajetoria } from '../mocks/graficos.js';

const FORMATO = {
  resultado_medio: (v) => brl(v, true),
  fluxo_operacional: (v) => brl(v, true),
  inadimplencia: (v) => pct(v),
  concentracao_caixa: (v) => pct(v),
};
const formatar = (chave) => FORMATO[chave] || ((v) => brl(v));

const nomeEmpresa = (id) => titulo(EMPRESAS.find((e) => e.id === id)?.nome || '');

export function montarPainel(raiz, { hoje }) {
  const estado = { empresa: null, historico: 6, horizonte: 9 };
  let contou = false;

  raiz.innerHTML = `${barraJanela(['Dashboards', 'Econômico Financeiro', 'Fluxo de Caixa'])}
  <div class="janela__corpo">
    ${lateralJanela(1)}
    <div class="mock">
      <div class="mock__cab">
        <h3 class="mock__titulo">Fluxo de Caixa</h3>
        <span class="mock__sub">Grupo Aurora · atualizado hoje às 06:00</span>
      </div>
      <div class="controls">
        <div class="ctl">
          <label for="p-empresa">Empresa</label>
          <select id="p-empresa" data-f="empresa">
            <option value="">Grupo Aurora (4 empresas)</option>
            ${EMPRESAS.map((e) => `<option value="${e.id}">${esc(titulo(e.nome))}</option>`).join('')}
          </select>
        </div>
        <div class="ctl">
          <span class="rot" id="p-hist">Histórico</span>
          <div class="seg" role="group" aria-labelledby="p-hist">
            <button type="button" data-f="historico" data-v="1" aria-pressed="false">1m</button>
            <button type="button" data-f="historico" data-v="6" aria-pressed="true">6m</button>
          </div>
        </div>
        <div class="ctl">
          <span class="rot" id="p-hor">Horizonte</span>
          <div class="seg" role="group" aria-labelledby="p-hor">
            <button type="button" data-f="horizonte" data-v="5" aria-pressed="false">5m</button>
            <button type="button" data-f="horizonte" data-v="9" aria-pressed="true">9m</button>
          </div>
        </div>
      </div>
      <section class="tiles" aria-label="Indicadores principais" data-tiles></section>
      <section class="panel hero" aria-labelledby="p-traj">
        <div class="ph">
          <h4 id="p-traj" data-traj-titulo></h4>
          <p>Realizado até hoje e, daqui em diante, o saldo no fim de cada mês pelo orçamento.</p>
        </div>
        <div class="legend">
          <span><i style="border-color:#2a78d6"></i>Realizado</span>
          <span><i class="dash" style="border-color:#2a78d6"></i>Orçamento</span>
          <span><i class="dash" style="border-color:#d03b3b"></i>Colchão: 1 mês de saídas operacionais</span>
        </div>
        <div class="chart" data-traj></div>
      </section>
    </div>
  </div>`;

  const elTiles = raiz.querySelector('[data-tiles]');
  const elTitulo = raiz.querySelector('[data-traj-titulo]');
  const elChart = raiz.querySelector('[data-traj]');
  let W = 800;

  const D = () => obterD({ hoje, empresa: estado.empresa, historico: estado.historico, horizonte: estado.horizonte });

  function desenharTiles(animar) {
    const cards = cartoesSite(D());
    elTiles.innerHTML = cards
      .map(
        (c) => `<div class="tile">
          <span class="k">${esc(c.titulo)}</span>
          <span class="v" data-chave="${c.chave}">${esc(c.valor_fmt)}</span>
          <span class="d">${partes(c.detalhe)}</span>
          <span class="st ${c.etiqueta.tom}">${esc(c.etiqueta.texto)}</span>
        </div>`
      )
      .join('');
    if (animar) {
      cards.forEach((c, i) => {
        if (c.valor === null) return;
        contar(elTiles.querySelector(`[data-chave="${c.chave}"]`), c.valor, formatar(c.chave), { atraso: i * 0.06 });
      });
    }
  }

  function desenharGrafico(animar = false) {
    const d = D();
    const escopo = estado.empresa ? curto(nomeEmpresa(estado.empresa)) : null;
    elTitulo.textContent = tituloTrajetoria(d, escopo);
    const g = trajetoria({ D: d, W });
    elChart.innerHTML = g.svg;
    ligarDica(elChart, g);
    if (animar && !reduzir()) {
      const r = elChart.querySelector('[data-revelar]');
      gsap.fromTo(r, { attr: { width: 0 } }, { attr: { width: g.W }, duration: 1.6, ease: 'power2.inOut' });
    }
  }

  function tudo() {
    desenharTiles(false);
    desenharGrafico(false);
  }

  raiz.addEventListener('change', (e) => {
    if (e.target.dataset.f !== 'empresa') return;
    estado.empresa = +e.target.value || null;
    tudo();
  });
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    estado[b.dataset.f] = +b.dataset.v;
    raiz.querySelectorAll(`button[data-f="${b.dataset.f}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    tudo();
  });

  observarLargura(elChart, (w) => {
    W = w;
    desenharGrafico(false);
  });
  desenharTiles(false);

  // Mês do mínimo do Orçamento no título da seção ("Quanto você vai ter em caixa em março?").
  const d0 = obterD({ hoje });
  document.querySelectorAll('[data-mes-minimo]').forEach((el) => (el.textContent = mesPorExtenso(d0.fut[d0.minIdx])));

  return {
    // A planilha acabou de cair: os números contam e a linha se desenha (uma vez).
    revelar() {
      if (contou) return;
      contou = true;
      desenharTiles(true);
      desenharGrafico(true);
    },
  };
}

// Fôlego de cada empresa sozinha — mapa de calor como o FolegoSpe do app.
export function montarFolego(raiz, { hoje }) {
  const d = obterD({ hoje });
  const { empresas, zeram, linhas, total, resumo } = folegoSite(d);
  const maxAbs = Math.max(1, ...empresas.flatMap((s) => [Math.abs(s.caixa), ...s.path.map(Math.abs)]));
  const linha = (s, rodape) => `<tr>
    <td class="nm"><b>${esc(rodape ? s.nome : curto(s.nome))}</b><span>${esc(s.centros.join(', '))}</span></td>
    <td class="sit">${rodape ? '' : `<span class="st ${s.situacao.tom}">${esc(s.situacao.texto)}</span>`}</td>
    <td class="n num">${esc(brl(s.caixa))}</td>
    ${s.path.map((v, i) => `<td class="c${!rodape && i === s.minIdx && s.min < s.caixa ? ' mn' : ''}" style="${corCelula(v, maxAbs)}">${esc(eixo(v))}</td>`).join('')}
    <td class="n num">${esc(brl(s.min))}<small>${esc(lbl(d.fut[s.minIdx]))}</small></td>
  </tr>`;
  raiz.innerHTML = `${barraJanela(['Dashboards', 'Econômico Financeiro', 'Fluxo de Caixa', 'Fôlego'], { usuario: false })}
  <div class="janela__corpo">
    <div class="mock">
      <div class="mock__cab"><h3 class="mock__titulo">Fôlego de cada empresa sozinha</h3></div>
      <div class="kv k4">
        <div><span>Empresas</span><strong>${empresas.length}</strong></div>
        <div><span>Zeram no horizonte</span><strong class="${zeram.length ? 'neg' : 'pos'}">${esc(resumo.zeram)}</strong></div>
        <div><span>Primeira a zerar</span><strong>${esc(resumo.primeira_a_zerar)}</strong></div>
        <div><span>Maior fatia do caixa</span><strong>${esc(resumo.maior_fatia)}</strong></div>
      </div>
      <div class="heat-wrap" tabindex="0" role="region" aria-label="Saldo projetado de cada empresa, mês a mês">
        <table class="heat">
          <thead><tr>
            <th class="l">Empresa</th><th class="l">Situação</th><th>Hoje</th>
            ${d.fut.map((m) => `<th>${esc(lbl(m))}</th>`).join('')}
            <th>Mínimo</th>
          </tr></thead>
          <tbody>${linhas.map((s) => linha(s)).join('')}</tbody>
          <tfoot>${linha(total, true)}</tfoot>
        </table>
      </div>
      <p class="note">Sem mútuo entre as empresas. A célula com contorno é o mês de menor saldo.</p>
    </div>
  </div>`;
  registrarCena(raiz, {});
  recalcular();
}
