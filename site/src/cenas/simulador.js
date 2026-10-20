// Simulador de cenários — o mesmo cenario() / PRESETS / presetDe() do painel do Horizon, ligado como o Hero
// de frontend/.../fluxo/secoes.jsx. Rótulos generalizados ("custos diretos" no lugar de "custo de obra").
import { brl, cenario, lbl, presetDe, PRESETS } from '../motor/modelo.js';
import { opcoesAtraso } from '../motor/analise.js';
import { obterD, rupturas } from '../dados/demo-calculado.js';
import { barraJanela, esc, lateralJanela } from '../nucleo/dom.js';
import { observarLargura } from '../nucleo/medida.js';
import { ligarDica, trajetoria } from '../mocks/graficos.js';

const ROTULO_PRESET = { base: 'Orçamento', cons: 'Conservador', stress: 'Estresse' };
const meses = (n) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

export function montarSimulador(raiz, { hoje }) {
  const D = obterD({ hoje });
  const opcoes = opcoesAtraso(D);
  // Padrão do site: atrasar a obra com repasses grandes (no app, a de maior entrada num mês).
  const padrao = opcoes.find((c) => /serra azul/i.test(c.nome))?.id ?? opcoes[0]?.id ?? null;
  let preset = 'cons';
  let sc = { ...PRESETS.cons, delayId: padrao };
  let W = 700;

  raiz.innerHTML = `${barraJanela(['Dashboards', 'Econômico Financeiro', 'Fluxo de Caixa', 'Simulador de cenário'])}
  <div class="janela__corpo">
    ${lateralJanela(1)}
    <div class="mock">
      <section class="panel hero" aria-labelledby="s-titulo">
        <div class="ph">
          <h3 id="s-titulo" data-s-titulo aria-live="polite"></h3>
          <p>Realizado até hoje e, daqui em diante, o saldo no fim de cada mês pelo orçamento e pelo cenário ao lado.</p>
        </div>
        <div class="hero-body">
          <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
            <div class="legend">
              <span><i style="border-color:#2a78d6"></i>Realizado</span>
              <span><i class="dash" style="border-color:#2a78d6"></i>Orçamento</span>
              <span><i style="border-color:#eb6834"></i><span data-s-legenda></span></span>
              <span><i class="dash" style="border-color:#d03b3b"></i>Colchão: 1 mês de saídas</span>
            </div>
            <div class="chart" data-s-chart></div>
          </div>
          <aside class="sim" aria-label="Controles do simulador">
            <h4>Simulador de cenário</h4>
            <div class="presets" role="group" aria-label="Cenários prontos">
              ${Object.entries(ROTULO_PRESET).map(([k, r]) => `<button type="button" data-preset="${k}" aria-pressed="${k === preset}">${r}</button>`).join('')}
            </div>
            <label class="opt">
              <input type="checkbox" data-k="overhead" />
              <span><b>Estrutura fixa no ritmo real</b><span>Pessoal e administrativo a ${esc(brl(D.overheadRun))}/mês, a média dos últimos meses, quando o orçamento projeta menos.</span></span>
            </label>
            <div class="range">
              <div class="row"><label for="s-obra">Estouro nos custos diretos</label><output for="s-obra" data-o="obra"></output></div>
              <input id="s-obra" type="range" min="0" max="40" step="5" data-k="obra" />
            </div>
            <div class="range">
              <div class="row"><label for="s-vendas">Queda na receita de vendas</label><output for="s-vendas" data-o="vendas"></output></div>
              <input id="s-vendas" type="range" min="0" max="40" step="5" data-k="vendas" />
            </div>
            <div class="range">
              <div class="row"><label for="s-delay-c">Atrasar entradas de</label><output data-o="delay"></output></div>
              <select id="s-delay-c" data-k="delayId">
                ${opcoes.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}
              </select>
              <input type="range" min="0" max="6" step="1" data-k="delay" aria-label="Meses de atraso" />
            </div>
          </aside>
        </div>
        <div class="kv">
          <div><span>Mínimo no cenário</span><strong data-r="min"></strong></div>
          <div><span>Fura o colchão</span><strong data-r="colchao"></strong></div>
          <div><span>Caixa zera</span><strong data-r="zero"></strong></div>
          <div><span>No fim do horizonte</span><strong data-r="fim"></strong></div>
        </div>
      </section>
    </div>
  </div>`;

  const q = (s) => raiz.querySelector(s);
  const chart = q('[data-s-chart]');

  function sincronizarControles() {
    q('[data-k="overhead"]').checked = sc.overhead;
    q('[data-k="obra"]').value = sc.obra;
    q('[data-k="vendas"]').value = sc.vendas;
    q('[data-k="delay"]').value = sc.delay;
    q('[data-k="delayId"]').value = sc.delayId ?? '';
    q('[data-o="obra"]').textContent = `${sc.obra}%`;
    q('[data-o="vendas"]').textContent = `${sc.vendas}%`;
    q('[data-o="delay"]').textContent = meses(sc.delay);
    raiz.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === preset)));
    q('[data-s-legenda]').textContent = preset ? PRESETS[preset].label.replace('Orçamento', 'orçamento') : 'Cenário personalizado';
  }

  function desenhar() {
    const serie = cenario(D, sc);
    const r = rupturas(D, serie);
    const mn = Math.min(...serie);
    const mi = serie.indexOf(mn);
    const titulo =
      r.colchao >= 0
        ? `Nesse cenário, o caixa fura o colchão em ${lbl(D.fut[r.colchao])}${r.zero >= 0 ? ` e zera em ${lbl(D.fut[r.zero])}` : ''}`
        : mn < D.caixaHoje
          ? `Nesse cenário, o caixa chega a ${brl(mn)} em ${lbl(D.fut[mi])} e fica acima do colchão`
          : 'Nesse cenário, o caixa cresce no horizonte';
    q('[data-s-titulo]').textContent = titulo;
    const set = (k, txt, cls = '') => {
      const el = q(`[data-r="${k}"]`);
      el.textContent = txt;
      el.className = cls;
    };
    set('min', `${brl(mn)} em ${lbl(D.fut[mi])}`, mn < D.colchao ? 'neg' : '');
    set('colchao', r.colchao >= 0 ? lbl(D.fut[r.colchao]) : 'não fura', r.colchao >= 0 ? 'neg' : 'pos');
    set('zero', r.zero >= 0 ? lbl(D.fut[r.zero]) : 'não zera', r.zero >= 0 ? 'neg' : 'pos');
    const dif = serie.at(-1) - D.saldoFut.at(-1);
    set('fim', Math.abs(dif) < 1 ? 'igual ao orçamento' : `${brl(dif, true)} vs. orçamento`, dif < -1 ? 'scen' : '');
    const g = trajetoria({ D, sc: serie, W, ruptura: true });
    chart.innerHTML = g.svg;
    ligarDica(chart, g);
  }

  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    preset = b.dataset.preset;
    sc = { ...PRESETS[preset], delayId: sc.delayId };
    sincronizarControles();
    desenhar();
  });
  raiz.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const v = k === 'overhead' ? e.target.checked : +e.target.value || (k === 'delayId' ? null : 0);
    sc = { ...sc, [k]: v };
    preset = presetDe(sc);
    sincronizarControles();
    desenhar();
  });

  sincronizarControles();
  observarLargura(chart, (w) => {
    W = w;
    desenhar();
  });
}
