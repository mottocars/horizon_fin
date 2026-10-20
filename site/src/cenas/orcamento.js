// Orçamento: versões (v1/v2/v3 mudam os meses abertos), meses fechados com cadeado e o desvio de cada linha,
// histórico de alterações que vai crescendo enquanto a tela está à vista, e "para qual lado o orçamento
// erra" — esse último calculado pelo motor do painel (calibracao) sobre o Grupo Aurora.
import { eixo, lbl, pct } from '../motor/modelo.js';
import { calibracao } from '../motor/analise.js';
import { obterD } from '../dados/demo-calculado.js';
import { orcamentoDemo } from '../dados/orcamento-demo.js';
import { barraJanela, esc, lateralJanela, nomeLinha } from '../nucleo/dom.js';
import { reduzir } from '../nucleo/preferencias.js';
import { registrarCena } from '../nucleo/cenas.js';

const CADEADO = '<svg class="cadeado" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.2" width="8" height="5.8" rx="1"/><path d="M3.8 5.2V3.8a2.2 2.2 0 0 1 4.4 0v1.4"/></svg>';

function corDesvio(dv, saida) {
  const ruim = saida ? dv > 0 : dv < 0;
  const p = Math.round(10 + Math.min(1, Math.abs(dv) / 9) * 34);
  return `background:color-mix(in srgb, var(${ruim ? '--crit' : '--good'}) ${p}%, var(--surface))`;
}

export function montarOrcamento(raiz, { hoje }) {
  const o = orcamentoDemo(hoje);
  const D = obterD({ hoje });
  const calib = calibracao(D).slice(0, 5);
  const maxDv = Math.max(1, ...calib.map((c) => Math.abs(c.dv)));
  let versao = 'v3';
  let fila = 0;
  let timer = 0;

  raiz.innerHTML = `${barraJanela(['Operações', 'Orçamento', `Orçamento ${hoje.slice(0, 4)}`])}
  <div class="janela__corpo">
    ${lateralJanela(2)}
    <div class="mock">
      <div class="mock__cab">
        <h3 class="mock__titulo">Orçamento ${hoje.slice(0, 4)}</h3>
        <span class="mock__sub">Grupo Aurora · consolidado</span>
      </div>
      <div class="controls">
        <div class="ctl">
          <span class="rot" id="o-versao">Versão</span>
          <div class="seg" role="group" aria-labelledby="o-versao">
            ${o.versoes.map((v) => `<button type="button" data-versao="${v.id}" aria-pressed="${v.id === versao}" title="${esc(v.nome)}, ${esc(v.data)}">${v.id} · ${esc(v.nome)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="orc-mock__corpo">
        <div class="orc-tab-wrap" tabindex="0" role="region" aria-label="Orçamento por linha e mês">
          <table class="orc-tab">
            <thead><tr>
              <th scope="col">Linha</th>
              ${o.fechados.map((m) => `<th scope="col" title="Mês fechado">${CADEADO}${esc(lbl(m))}</th>`).join('')}
              ${o.abertos.map((m) => `<th scope="col">${esc(lbl(m))}</th>`).join('')}
            </tr></thead>
            <tbody data-orc></tbody>
          </table>
        </div>
        <div class="orc-lado">
          <div class="panel">
            <h4 class="ph-mini">Histórico</h4>
            <ol class="orc-log" data-log aria-live="off"></ol>
          </div>
          <div class="panel">
            <h4 class="ph-mini">O orçamento erra para qual lado?</h4>
            <ol class="calib">
              ${calib
                .map((c) => {
                  const larg = (Math.abs(c.dv) / maxDv) * 48;
                  const esq = c.dv >= 0 ? 50 : 50 - larg;
                  return `<li><span>${esc(nomeLinha(c.nome))}</span><span class="barra"><i style="left:${esq}%;width:${larg}%;background:var(${c.ruim ? '--crit' : '--good'})"></i></span><span class="num">${esc(pct(c.dv, true))}</span></li>`;
                })
                .join('')}
            </ol>
            <p class="note">Realizado contra orçado nos últimos ${D.hist.length} meses. Vermelho: gasto acima ou receita abaixo.</p>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  const corpo = raiz.querySelector('[data-orc]');
  const log = raiz.querySelector('[data-log]');

  function desenhar(anterior) {
    const v = o.versoes.find((x) => x.id === versao);
    corpo.innerHTML = o.linhas
      .map((l) => {
        const saida = l.base < 0;
        const f = v.fator[l.id] ?? 1;
        const fechados = l.fechados
          .map((c) => `<td class="fechado" style="${corDesvio(c.dv, saida)}">${esc(eixo(c.r))}<small>${esc(pct(c.dv, true))}</small></td>`)
          .join('');
        const abertos = l.abertos
          .map((c) => {
            const fa = anterior ? (o.versoes.find((x) => x.id === anterior).fator[l.id] ?? 1) : f;
            return `<td class="aberto${anterior && fa !== f ? ' mudou' : ''}">${esc(eixo(c.o * f))}</td>`;
          })
          .join('');
        return `<tr><td>${esc(l.nome)}</td>${fechados}${abertos}</tr>`;
      })
      .join('');
    if (anterior) setTimeout(() => corpo.querySelectorAll('.mudou').forEach((td) => td.classList.remove('mudou')), 900);
  }

  const item = (h, novo) =>
    `<li class="${h.ia ? 'por-ia' : ''}${novo ? ' novo' : ''}"><span class="janela__avatar">${esc(h.ini)}</span><span><b>${esc(h.quem)}</b> ${esc(h.texto)}<time>${esc(h.quando)}</time></span></li>`;
  log.innerHTML = o.historico.map((h) => item(h)).join('');

  function proxima() {
    const h = o.novidades[fila % o.novidades.length];
    fila++;
    log.insertAdjacentHTML('afterbegin', item(h, true));
    while (log.children.length > 4) log.lastElementChild.remove();
    timer = setTimeout(proxima, 3600);
  }

  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-versao]');
    if (!b || b.dataset.versao === versao) return;
    const anterior = versao;
    versao = b.dataset.versao;
    raiz.querySelectorAll('[data-versao]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    desenhar(anterior);
  });

  desenhar();
  registrarCena(raiz, {
    entrar() {
      if (reduzir()) return;
      clearTimeout(timer);
      timer = setTimeout(proxima, 1400);
    },
    sair() {
      clearTimeout(timer);
    },
  });
}
