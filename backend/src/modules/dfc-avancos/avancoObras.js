const { segmentos } = require('../cronograma-centros/cronogramaExcel.service');
const { periodoDe, periodosEntre, periodoAnterior, rotulo, valorEm, somar } = require('./periodosAvanco');

// Contas do Avanço das Obras (Obra 360º) no servidor — as mesmas da tela (frontend:
// CronogramasObras/CurvasAvanco.jsx), usadas pelo Excel (avancoExcel.service.js) e pelo módulo OBRA 360º
// do conector MCP Horizon (integracoes-mcp/obras). As curvas vêm de curvasPorData (dfcAvancos.service):
// - PLS (Caixa): o avanço medido pela Caixa — o % acumulado do cronograma físico-financeiro do DCD, só as
//   parcelas liberadas; só tem realizado;
// - Curva S de Obras (orçamento primário do Prevision): o avanço real da obra, previsto × realizado;
// - Curva S PLS (orçamento secundário do Prevision): a curva da PLS que a empresa registrou no Prevision.
// Mudou uma regra na tela? Mude aqui também.

const TOLERANCIA = 0.05; // ponto percentual: abaixo disso é arredondamento do Prevision (como na tela)
const vazio = (v) => v === null || v === undefined;
const ate100 = (v) => (vazio(v) ? null : Math.min(v, 100));
const nomeObra = (o) => String(o.apelido || '').trim() || String(o.name || '').trim();

const CURVAS = [
  { chave: 'pls', rotulo: 'PLS (Caixa)' },
  // Nomes dos orçamentos do Prevision (pedido do usuário): primário = Curva S de Obras, secundário = Curva S PLS.
  { chave: 'primaria', rotulo: 'Curva S de Obras (Prevision)' },
  { chave: 'secundaria', rotulo: 'Curva S PLS (Prevision)' },
];
// As séries de uma curva: { previsto, realizado } em [[data, %]...] (o PLS só tem o realizado).
const seriesDa = (obra, chave) =>
  chave === 'pls' ? (obra.pls ? { previsto: null, realizado: obra.pls.pontos } : null) : obra[chave] || null;

// Etapa da carteira hoje, com o mês dela como no Gantt ("17 de 30").
const idxMes = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const posMes = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return idxMes(iso) + (d - 1) / new Date(Date.UTC(a, m, 0)).getUTCDate();
};
function etapaHoje(centro, etapas, hoje) {
  if (!centro) return { nome: 'Sem cronograma', mes: '' };
  const segs = segmentos(centro, etapas);
  if (!segs.length) return { nome: 'Sem cronograma', mes: '' };
  const seg = segs.filter((s) => s.inicio <= hoje && (!s.fim || hoje <= s.fim)).at(-1);
  if (!seg) return { nome: hoje < segs[0].inicio ? 'A iniciar' : 'Concluída', mes: '' };
  const total = seg.fim ? Math.max(1, Math.round(posMes(somar(seg.fim, 1)) - posMes(seg.inicio))) : null;
  const atual = idxMes(hoje) - idxMes(seg.inicio) + 1;
  return { nome: seg.etapa.descricao, mes: total ? `${Math.min(atual, total)} de ${total}` : String(atual), segmento: seg };
}

// Os cards de uma obra (a linha da tela): realizado acumulado até hoje e, nas curvas do Prevision, o
// previsto acumulado no fim do período da visão (`fimPeriodo`: último dia do mês, sábado da semana ou
// hoje). Finalizada = todas as curvas que a obra tem com o realizado em 100%.
function cardsDaObra(obra, hoje, fimPeriodo) {
  const col = (chave) => {
    const s = seriesDa(obra, chave);
    if (!s) return null;
    return {
      realizado: ate100(valorEm(s.realizado, hoje)),
      previsto: s.previsto ? ate100(valorEm(s.previsto, fimPeriodo)) : null,
    };
  };
  const c = { obra, nome: nomeObra(obra), pls: col('pls'), primaria: col('primaria'), secundaria: col('secundaria') };
  const realizados = CURVAS.map((k) => c[k.chave]).filter(Boolean).map((x) => x.realizado);
  c.finalizada = realizados.length > 0 && realizados.every((v) => !vazio(v) && v >= 99.95);
  return c;
}

// Recorte da obra (o mesmo dos gráficos): início = primeiro avanço de qualquer curva; fim = o dia em que
// a última curva chega a 100% ou, se alguma não chega, o último ponto e hoje.
function recorteDaObra(obra, hoje) {
  let ini = null;
  let fim = hoje;
  CURVAS.forEach(({ chave }) => {
    const s = seriesDa(obra, chave);
    if (!s) return;
    const lista = [s.previsto, s.realizado].filter(Boolean);
    let fimCurva = null;
    let todasCem = lista.length > 0;
    lista.forEach((pontos) => {
      const primeiro = pontos.find((p) => p[1] > 0);
      if (primeiro && (!ini || primeiro[0] < ini)) ini = primeiro[0];
      const cem = pontos.find((p) => p[1] >= 99.95);
      if (!cem) todasCem = false;
      const f = cem ? cem[0] : pontos[pontos.length - 1][0];
      if (!fimCurva || f > fimCurva) fimCurva = f;
    });
    if (fimCurva && !todasCem && fimCurva < hoje) fimCurva = hoje;
    if (fimCurva && fimCurva > fim) fim = fimCurva;
  });
  return { ini: ini || hoje, fim };
}

// Os períodos da visão para a obra: sem De/Até, a obra inteira (com o período antes do primeiro avanço);
// com De/Até, o recorte pedido sem passar do fim da obra.
function periodosDaObra(obra, { visao, de, ate, hoje }) {
  const { ini, fim } = recorteDaObra(obra, hoje);
  if (de || ate) {
    const a = de || ini;
    const b = ate && ate < fim ? ate : fim;
    return periodosEntre(visao, a, b < a ? a : b);
  }
  const lista = periodosEntre(visao, ini, fim < ini ? ini : fim);
  lista.unshift(periodoAnterior(visao, lista[0]));
  return lista;
}

// As linhas de uma curva nos períodos (o empilhado do Excel): acumulado previsto e realizado no fim do
// período (o realizado para em hoje; depois, null), o avanço do próprio período, o desvio em pontos
// percentuais e a situação. null se a obra não tem a curva.
function linhasDaCurva(obra, chave, periodos, { visao, hoje }) {
  const s = seriesDa(obra, chave);
  if (!s) return null;
  const real = (dia) => (dia > hoje ? null : ate100(valorEm(s.realizado, dia)));
  const prev = (dia) => (s.previsto ? ate100(valorEm(s.previsto, dia)) : null);
  return periodos.map((p) => {
    const antes = somar(p.ini, -1);
    const realAcc = p.ini > hoje ? null : real(p.fim < hoje ? p.fim : hoje);
    const prevAcc = prev(p.fim);
    const realPer = vazio(realAcc) ? null : realAcc - (real(antes) || 0);
    const prevPer = vazio(prevAcc) ? null : prevAcc - (prev(antes) || 0);
    const desvio = !vazio(realAcc) && !vazio(prevAcc) ? realAcc - prevAcc : null;
    return {
      periodo: rotulo(visao, p),
      ini: p.ini,
      fim: p.fim,
      previstoAcumulado: prevAcc,
      realizadoAcumulado: realAcc,
      desvio,
      previstoNoPeriodo: prevPer,
      realizadoNoPeriodo: realPer,
      situacao: vazio(desvio) ? '' : -desvio >= TOLERANCIA ? 'Abaixo do previsto' : 'Em dia',
      hoje: p.ini <= hoje && hoje <= p.fim,
    };
  });
}

module.exports = {
  TOLERANCIA,
  CURVAS,
  vazio,
  ate100,
  nomeObra,
  seriesDa,
  etapaHoje,
  cardsDaObra,
  recorteDaObra,
  periodosDaObra,
  linhasDaCurva,
  periodoDe,
};
