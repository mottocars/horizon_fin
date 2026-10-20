// Espião NF-e / NFS-e — réplica da tela Operações › Espião NFe / NFSe, contando uma história quando aparece:
// as notas chegam da SEFAZ e do ADN, um evento cancela uma delas, a vinculação ao contas a pagar confere CNPJ,
// data e nº e vai esvaziando "Recebidas"; sobra o que ninguém lançou, somado no Acervo. As abas funcionam e
// "Consultar novamente" repete. Com movimento reduzido, a tela já abre no fim da história.
import logoSienge from '../assets/integracoes/sienge.svg';
import { notasDemo } from '../dados/notas-demo.js';
import { barraJanela, esc, lateralJanela } from '../nucleo/dom.js';
import { registrarCena } from '../nucleo/cenas.js';
import { reduzir } from '../nucleo/preferencias.js';

const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moeda = (v) => `R$ ${nf2.format(v)}`;
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataBR = (iso) => iso.split('-').reverse().join('/');

// Mesmos ícones da tela (lucide: Package = produto/NF-e, Wrench = serviço/NFS-e).
const ICONES = {
  nfe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  nfse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  arquivo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8M16 17H8"/></svg>',
  emitida: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  cancelada: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
};
const ABAS = [
  ['recebidas', 'Recebidas', ['recebida', 'conferindo']],
  ['vinculadas', 'Vinculadas', ['vinculada']],
  ['inativadas', 'Inativadas', []],
  ['canceladas', 'Canceladas', ['cancelada']],
];
const FAIXAS = [
  ['Até 15 dias', (d) => d <= 15],
  ['16 a 30 dias', (d) => d > 15 && d <= 30],
  ['31 a 60 dias', (d) => d > 30 && d <= 60],
  ['Mais de 60 dias', (d) => d > 60],
];

export function montarEspiao(raiz, { hoje }) {
  const { certificados, notas, inicio, fim } = notasDemo(hoje);
  const pneus = notas.find((n) => n.destino === 'cancela');
  const est = new Map();
  let aba = 'recebidas';
  let timers = [];
  let tocou = false;
  let consultado = false;
  const depois = (ms, fn) => timers.push(setTimeout(fn, ms));

  raiz.innerHTML = `${barraJanela(['Operações', 'Espião NFe / NFSe'])}
  <div class="janela__corpo">
    ${lateralJanela(3)}
    <div class="mock espiao">
      <div class="mock__cab">
        <h3 class="mock__titulo">Espião NFe / NFSe</h3>
        <span class="mock__sub">Grupo Aurora · consultas automáticas a cada 1 hora</span>
      </div>
      <div class="controls espiao__controles">
        <div class="ctl"><span class="rot">Empresa</span><span class="espiao__campo">Grupo Aurora</span></div>
        <div class="ctl"><span class="rot">Data início</span><span class="espiao__campo num">${dataBR(inicio)}</span></div>
        <div class="ctl"><span class="rot">Data fim</span><span class="espiao__campo num">${dataBR(fim)}</span></div>
        <button type="button" class="espiao__consultar" data-consultar>Consultar novamente</button>
        <span class="espiao__status" data-status aria-live="off"></span>
      </div>
      <div class="seg espiao__abas" role="group" aria-label="Situação das notas" data-abas-espiao></div>
      <p class="espiao__alerta" data-alerta hidden></p>
      <div class="espiao__corpo">
        <div class="espiao__tabela" tabindex="0" role="region" aria-label="Notas fiscais da situação escolhida">
          <table class="espiao-tab">
            <thead><tr>
              <th scope="col">Empresa / Nota</th>
              <th scope="col" class="col-tipo" title="Produto (NF-e)">${ICONES.nfe}<span class="visualmente-oculto">Produto (NF-e)</span></th>
              <th scope="col" class="col-tipo" title="Serviço (NFS-e)">${ICONES.nfse}<span class="visualmente-oculto">Serviço (NFS-e)</span></th>
              <th scope="col">Emissor</th>
              <th scope="col" class="col-emissao">Emissão</th>
              <th scope="col" class="col-valor">Valor</th>
              <th scope="col">Situação</th>
              <th scope="col" class="col-arq">PDF</th>
              <th scope="col" class="col-arq">XML</th>
              <th scope="col">Vincular</th>
            </tr></thead>
            <tbody data-notas></tbody>
          </table>
        </div>
        <div class="espiao__lado">
          <section class="panel acervo" aria-labelledby="acervo-t">
            <h4 class="ph-mini" id="acervo-t">Acervo NF-e / NFS-e · Pendentes</h4>
            <p class="acervo__valor num" data-acervo-valor></p>
            <p class="acervo__sub" data-acervo-sub></p>
            <ul class="acervo__faixas" data-faixas></ul>
          </section>
          <section class="panel historico" aria-labelledby="hist-t">
            <h4 class="ph-mini" id="hist-t">Histórico da nota</h4>
            <p class="historico__nota">NF-e ${esc(pneus.numero)} · ${esc(pneus.emissor)}</p>
            <ol class="historico__linha">
              <li><b>Emitida</b><time class="num">${ddmm(pneus.emissao)} 14:02</time><span>Nota emitida normalmente — nenhum evento adicional (cancelamento, correção, etc.) foi registrado até agora.</span></li>
              <li class="historico__cancel" data-hist-cancel hidden><b>Cancelamento</b><time class="num">${ddmm(fim)} 02:14</time><span>O emitente cancelou esta nota — ela não tem mais validade fiscal.</span></li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  </div>`;

  const corpo = raiz.querySelector('[data-notas]');
  const abasEl = raiz.querySelector('[data-abas-espiao]');
  const status = raiz.querySelector('[data-status]');
  const alerta = raiz.querySelector('[data-alerta]');
  const botao = raiz.querySelector('[data-consultar]');
  const histCancel = raiz.querySelector('[data-hist-cancel]');

  const marcar = (fases, marca) => notas.forEach((n) => est.set(n.id, { fase: fases(n), marca: marca(n) }));
  const inicial = () => marcar((n) => (n.antiga ? 'recebida' : 'oculta'), () => null);
  const final = () =>
    marcar(
      (n) => (n.destino === 'vincula' ? 'vinculada' : n.destino === 'cancela' ? 'cancelada' : 'recebida'),
      (n) => (n.destino === 'ambigua' || n.destino === 'sem-titulo' ? n.destino : null)
    );
  const da = (fasesAba) => notas.filter((n) => fasesAba.includes(est.get(n.id).fase));
  const pendentes = () => notas.filter((n) => ['recebida', 'conferindo'].includes(est.get(n.id).fase));

  function dizer(texto, rodando = false) {
    status.textContent = texto;
    status.classList.toggle('rodando', rodando);
  }

  function linha(n, novas) {
    const e = est.get(n.id);
    const conf =
      e.fase === 'conferindo'
        ? '<span class="confere"><i>CNPJ</i><i>Data</i><i>Nº</i></span>'
        : e.marca === 'ambigua'
          ? '<span class="chip warn">3/3 em 2 títulos · revisar</span>'
          : e.marca === 'sem-titulo'
            ? `<span class="chip crit">sem título no contas a pagar · há ${n.dias} dias</span>`
            : '';
    const vinc = e.fase === 'vinculada';
    const cancel = e.fase === 'cancelada';
    return `<tr class="nota${novas.has(n.id) ? ' chegou' : ''}${cancel ? ' cancelada' : ''}" data-id="${n.id}">
      <td class="num">Nº ${esc(n.numero)}</td>
      <td class="col-tipo${n.tipo === 'nfe' ? ' ativo' : ''}">${n.tipo === 'nfe' ? ICONES.nfe : ''}</td>
      <td class="col-tipo${n.tipo === 'nfse' ? ' ativo' : ''}">${n.tipo === 'nfse' ? ICONES.nfse : ''}</td>
      <td><span class="espiao__emissor">${esc(n.emissor)}</span>${conf}</td>
      <td class="col-emissao num">${ddmm(n.emissao)}</td>
      <td class="col-valor num">${moeda(n.valor)}</td>
      <td class="situacao ${cancel ? 'crit' : 'good'}" title="${cancel ? 'Cancelada' : 'Emitida'} — clique para ver o histórico">${cancel ? ICONES.cancelada : ICONES.emitida}</td>
      <td class="col-arq">${ICONES.arquivo}</td>
      <td class="col-arq">${ICONES.arquivo}</td>
      <td class="vincular${vinc ? ' ok' : ''}" title="${vinc ? 'Vinculada a um título do contas a pagar' : 'Vincular a um título do contas a pagar (Sienge)'}"><img src="${logoSienge}" width="18" height="18" alt="" />${vinc ? '<i class="ok-check" aria-hidden="true">✓</i>' : ''}</td>
    </tr>`;
  }

  function desenhar(novas = new Set()) {
    const [, , fasesAba] = ABAS.find(([k]) => k === aba);
    abasEl.innerHTML = ABAS.map(
      ([k, rot, f]) => `<button type="button" data-aba="${k}" aria-pressed="${k === aba}">${rot} (${da(f).length})</button>`
    ).join('');
    const visiveis = da(fasesAba);
    const consulta = consultado ? 'agora' : 'há 1 hora';
    corpo.innerHTML =
      certificados
        .map((c) => {
          const dela = visiveis.filter((n) => n.cert === c.id);
          const nfe = dela.filter((n) => n.tipo === 'nfe').length;
          const nfse = dela.length - nfe;
          const dias = Math.round((Date.parse(c.vencimento) - Date.parse(hoje)) / 864e5);
          return `<tr class="cert"><td colspan="10">
            <b>${esc(c.empresa)}</b><span class="num">${esc(c.cnpj)}</span>
            <span class="espiao__cont">NF-e ${nfe} · NFS-e ${nfse}</span>
            <span class="espiao__consulta">Consulta: ${consulta}</span>
            <span class="chip ${dias <= 10 ? 'warn' : 'good'}">Vencimento ${dataBR(c.vencimento)}</span>
          </td></tr>${dela.map((n) => linha(n, novas)).join('')}`;
        })
        .join('') + (visiveis.length ? '' : `<tr><td colspan="10" class="espiao__vazio">${aba === 'inativadas' ? 'Nenhuma nota inativada no período.' : 'Nenhuma nota nesta situação no período.'}</td></tr>`);

    // Acervo: notas recebidas sem título no contas a pagar, por dias desde a emissão.
    const pend = pendentes();
    const total = pend.reduce((s, n) => s + n.valor, 0);
    const media = pend.length ? Math.round(pend.reduce((s, n) => s + n.dias, 0) / pend.length) : 0;
    raiz.querySelector('[data-acervo-valor]').textContent = moeda(total);
    raiz.querySelector('[data-acervo-sub]').textContent = pend.length
      ? `${pend.length} ${pend.length === 1 ? 'nota' : 'notas'} · média ${media} ${media === 1 ? 'dia' : 'dias'}`
      : 'Nenhuma nota pendente no período';
    const maximo = Math.max(1, ...FAIXAS.map(([, f]) => pend.filter((n) => f(n.dias)).length));
    raiz.querySelector('[data-faixas]').innerHTML = FAIXAS.map(([rot, f]) => {
      const q = pend.filter((n) => f(n.dias)).length;
      return `<li><span>${rot}</span><span class="acervo__barra"><i style="width:${(q / maximo) * 100}%"></i></span><span class="num">${q}</span></li>`;
    }).join('');
  }

  function mostrarFim() {
    const pend = pendentes();
    alerta.innerHTML = `<b>${pend.length} notas sem título no contas a pagar</b> · ${moeda(pend.reduce((s, n) => s + n.valor, 0))} que alguém ainda vai cobrar`;
    alerta.hidden = false;
    histCancel.hidden = false;
    dizer('5 nota(s) vinculada(s) de 7 sem vínculo · 1 ambígua(s)');
  }

  // Tira a linha de "Recebidas" com um desvanecer antes de mudar a situação.
  function sair(id, depoisDe) {
    const tr = corpo.querySelector(`tr[data-id="${id}"]`);
    if (aba === 'recebidas' && tr) {
      tr.classList.add('saindo');
      depois(360, depoisDe);
    } else depoisDe();
  }

  function tocar() {
    timers.forEach(clearTimeout);
    timers = [];
    consultado = false;
    alerta.hidden = true;
    histCancel.hidden = true;
    botao.disabled = true;
    inicial();
    desenhar();
    dizer('Consultando SEFAZ e ADN pelo certificado de cada CNPJ…', true);
    let t = 600;
    // 1. As notas chegam.
    notas
      .filter((n) => !n.antiga)
      .forEach((n) => {
        depois(t, () => {
          consultado = true;
          est.get(n.id).fase = 'recebida';
          desenhar(new Set([n.id]));
        });
        t += 430;
      });
    const nfe = notas.filter((n) => !n.antiga && n.tipo === 'nfe').length;
    const nfse = notas.filter((n) => !n.antiga && n.tipo === 'nfse').length;
    depois(t + 300, () => dizer(`Consulta concluída · Produtos (NF-e): ${nfe} salvas de ${nfe} encontradas · Serviços (NFS-e): ${nfse} salvas de ${nfse} encontradas`));
    // 2. Chega o cancelamento de uma delas.
    t += 1200;
    depois(t, () => {
      dizer(`Evento da SEFAZ: cancelamento da NF-e ${pneus.numero}`);
      histCancel.hidden = false;
      const tr = corpo.querySelector(`tr[data-id="${pneus.id}"]`);
      tr?.classList.add('cancelando');
      depois(700, () =>
        sair(pneus.id, () => {
          est.get(pneus.id).fase = 'cancelada';
          desenhar();
        })
      );
    });
    // 3. Vinculação ao contas a pagar: CNPJ, data e nº.
    t += 1500;
    depois(t, () => dizer('Vinculação ao contas a pagar: conferindo CNPJ, data e nº com os títulos do Sienge…', true));
    const ordem = [...notas.filter((n) => n.destino === 'vincula'), ...notas.filter((n) => n.destino === 'ambigua' || n.destino === 'sem-titulo')];
    ordem.forEach((n) => {
      t += 950;
      depois(t, () => {
        est.get(n.id).fase = 'conferindo';
        desenhar();
      });
      depois(t + 760, () => {
        if (n.destino === 'vincula') {
          sair(n.id, () => {
            est.get(n.id).fase = 'vinculada';
            desenhar();
          });
        } else {
          Object.assign(est.get(n.id), { fase: 'recebida', marca: n.destino });
          desenhar(new Set([n.id]));
        }
      });
    });
    // 4. O que sobrou é o que ninguém lançou.
    depois(t + 1500, () => {
      mostrarFim();
      botao.disabled = false;
    });
  }

  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-aba]');
    if (b) {
      aba = b.dataset.aba;
      desenhar();
      return;
    }
    if (e.target.closest('[data-consultar]') && !botao.disabled) {
      aba = 'recebidas';
      reduzir() ? (final(), (consultado = true), desenhar(), mostrarFim()) : tocar();
    }
  });

  // Antes de aparecer (e com movimento reduzido), a tela mostra o fim da história.
  final();
  consultado = true;
  desenhar();
  mostrarFim();
  registrarCena(raiz, {
    entrar() {
      if (tocou || reduzir()) return;
      tocou = true;
      tocar();
    },
  });
}
