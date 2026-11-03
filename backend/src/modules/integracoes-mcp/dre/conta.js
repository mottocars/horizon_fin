const { vespera } = require('./base');

// A conta de uma linha da DRE num centro e num intervalo [de, ate], com as MESMAS funções do motor
// (demonstrativo.service::motor — custoAte, base, pocEm, pocDespesa, fracaoDistratada) e a regra da
// linha (dre-exportacao/exportacao.service::regraDa):
//   valor = base acumulada até o fim × fator no fim − base acumulada até a véspera × fator na véspera
//         = avanço sobre a base antiga (base véspera × Δfator) + base nova × fator do fim.

const NOME_FATOR = {
  POC_RECEITA: 'POC de Receita (obra executada: custo acumulado ÷ orçamento, até 100%)',
  POC_DESPESA: 'POC de Despesa (fração ideal vendida + em permuta)',
  POC_DESPESA_LIQ: 'POC de Despesa − fração distratada',
  DISTRATADA: 'fração distratada',
};

function acumulado(d, regra, x, id, D) {
  const b = regra.base;
  if (b.fonte === 'FIN') return b.sinal * b.mascaras.reduce((t, mid) => t + d.m.custoAte.get(mid)(id, D), 0);
  return d.m.base[x.calculo](id, D);
}

function fator(d, regra, id, D) {
  const { m } = d;
  if (regra.fator === 'POC_RECEITA') return m.pocEm(id, D).poc;
  if (regra.fator === 'POC_DESPESA') return m.pocDespesa(id, D);
  if (regra.fator === 'POC_DESPESA_LIQ') return m.pocDespesa(id, D) - m.fracaoDistratada(id, D);
  if (regra.fator === 'DISTRATADA') return m.fracaoDistratada(id, D);
  return 1;
}

// Linha com base × fator (as de receita e as do Financeiro). null = RET ou sem cálculo.
function contaDaLinha(d, x, id, de, ate) {
  const regra = d.regras.get(x.id);
  if (!regra || (regra.tipo !== 'FIN' && regra.tipo !== 'RECEITA')) return null;
  const antes = vespera(de);
  const K = acumulado(d, regra, x, id, antes);
  const L = acumulado(d, regra, x, id, ate);
  const M = fator(d, regra, id, antes);
  const N = fator(d, regra, id, ate);
  return {
    base_ate_vespera: K,
    base_ate_fim: L,
    fator_vespera: M,
    fator_fim: N,
    reconhecido_ate_vespera: K * M,
    reconhecido_ate_fim: L * N,
    valor: L * N - K * M,
    avanco_sobre_base_antiga: K * (N - M),
    base_nova_x_fator: (L - K) * N,
  };
}

// Versão do orçamento vigente numa data (a de início mais recente até ela) e o total dela.
function orcamentoEm(d, id, D) {
  const porInicio = new Map();
  d.orcamento.filter((o) => o.centro_id === id && o.inicio <= D).forEach((o) => porInicio.set(o.inicio, (porInicio.get(o.inicio) || 0) + o.valor));
  const inicio = [...porInicio.keys()].sort().pop() || null;
  return { versao: inicio, total: inicio ? porInicio.get(inicio) : 0 };
}

// Os percentuais da obra numa data, com o que os forma.
function pocsEm(d, id, D) {
  const { m } = d;
  const r = m.pocEm ? m.pocEm(id, D) : null;
  const o = orcamentoEm(d, id, D);
  return {
    data: D,
    poc_receita: r ? r.poc : null,
    custo_acumulado: r ? r.custo : null,
    orcamento_vigente: r ? r.orcamento : o.total,
    versao_orcamento: o.versao,
    fracao_vendida: m.base.FRACAO_VENDAS(id, D),
    fracao_permuta: m.base.FRACAO_PERMUTA(id, D),
    poc_despesa: m.pocDespesa(id, D),
    fracao_distratada: m.fracaoDistratada(id, D),
  };
}

module.exports = { NOME_FATOR, acumulado, fator, contaDaLinha, orcamentoEm, pocsEm };
