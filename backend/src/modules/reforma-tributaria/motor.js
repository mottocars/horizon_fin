// Operações > Reforma Tributária — o cálculo (sem banco). Parte da DRE projetada de um centro (a foto
// mês a mês da Projeção da DRE: `mensal` + `poc`) e refaz, de INICIO em diante, o imposto sobre a receita
// e o crédito sobre o custo pelo regime do centro:
//
//   receita (R)   = as linhas da BASE do imposto fixo da DRE (as mesmas do RET: Máscaras › Informar
//                   histórico), no mês — a receita já reconhecida pela POC;
//   RET (transição, art. 485 da LC 214/2025)
//                 IBS/CBS   = −R × ret_ibs_cbs        IRPJ/CSLL = −R × ret_irpj_csll
//                 (sem crédito e sem redutores — padrão 2,08% + 1,92% = os mesmos 4% de hoje);
//   REGULAR       IBS/CBS   = −R × (1 − ρ) × (CBS + IBS do ano) × (1 − redução dos imóveis)
//                 IRPJ/CSLL = −R × irpj_csll do centro
//                 ρ (redutores) = (terreno + unidades residenciais × redutor social + lotes × redutor do
//                 lote) ÷ a receita da obra inteira na projeção, até 100% — o redutor é distribuído pela
//                 receita, na proporção dela;
//                 crédito   = o princípio do acumulado da DRE: o custo incorrido em cada mês desde INICIO
//                 (Δ do custo acumulado da POC) × % do custo que gera crédito × (CBS + IBS do mês) vira o
//                 crédito acumulado, que entra na DRE pela fração vendida líquida (POC de Despesa −
//                 distratada), como o próprio custo (CIV): crédito do mês = acumulado × vendido no fim do
//                 mês − o reconhecido até o mês anterior.
//   Sem regime (não configurado): a obra fica como está na projeção.
// Antes de INICIO nada muda (2026 é o ano de teste, compensável).

const INICIO = '2027-01';

// Padrões (aba Alíquotas, editáveis). CBS de referência de 2027: 11,3% (cálculo do TCU de 28/10/2026, a
// resolução do Senado sai até 15/12/2026), menos 0,1 p.p. em 2027 e 2028; IBS de 0,1% em 2027 e 2028 e,
// de 2029 a 2032, 10%, 20%, 30% e 40% da referência (18,7%: estimativa do Comitê Gestor) até a cheia em 2033.
const PADRAO = {
  aliquotas: {
    2027: { cbs: 11.2, ibs: 0.1 },
    2028: { cbs: 11.2, ibs: 0.1 },
    2029: { cbs: 11.3, ibs: 1.87 },
    2030: { cbs: 11.3, ibs: 3.74 },
    2031: { cbs: 11.3, ibs: 5.61 },
    2032: { cbs: 11.3, ibs: 7.48 },
    2033: { cbs: 11.3, ibs: 18.7 },
  },
  reducao_imoveis: 50,
  redutor_residencial: 100000,
  redutor_lote: 30000,
  ret_ibs_cbs: 2.08,
  ret_irpj_csll: 1.92,
};

// IRPJ/CSLL fora do RET (Lucro Presumido na venda de imóveis): IRPJ 15% + adicional 10% sobre 8% de
// presunção (2,00%) + CSLL 9% sobre 12% (1,08%).
const IRPJ_CSLL_PADRAO = 3.08;

const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// Parâmetros da empresa com o padrão no que faltar.
function parametros(cfg) {
  if (!cfg) return { ...PADRAO, aliquotas: { ...PADRAO.aliquotas } };
  const aliquotas = {};
  Object.entries(cfg.aliquotas || {}).forEach(([ano, a]) => {
    aliquotas[ano] = { cbs: num(a?.cbs), ibs: num(a?.ibs) };
  });
  return {
    aliquotas: Object.keys(aliquotas).length ? aliquotas : { ...PADRAO.aliquotas },
    reducao_imoveis: num(cfg.reducao_imoveis),
    redutor_residencial: num(cfg.redutor_residencial),
    redutor_lote: num(cfg.redutor_lote),
    ret_ibs_cbs: num(cfg.ret_ibs_cbs),
    ret_irpj_csll: num(cfg.ret_irpj_csll),
  };
}

// CBS + IBS (%) de um ano: a do ano ou a do último ano anterior que tiver; antes do primeiro, null.
function aliquotaDoAno(p, ano) {
  const anos = Object.keys(p.aliquotas)
    .map(Number)
    .sort((a, b) => a - b);
  let escolhido = null;
  anos.forEach((a) => {
    if (a <= ano) escolhido = a;
  });
  if (escolhido === null) return null;
  const a = p.aliquotas[escolhido];
  return { cbs: num(a.cbs), ibs: num(a.ibs), total: num(a.cbs) + num(a.ibs) };
}

// O custo acumulado da obra e a fração vendida líquida em qualquer mês, pela POC da foto (a da trava e a
// de cada mês projetado). Antes do primeiro ponto vale o primeiro (não credita o custo anterior à foto).
function serieCusto(poc) {
  const pontos = [poc?.trava, ...(poc?.meses || [])]
    .filter((x) => x && x.mes)
    .sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  const em = (mes) => {
    let r = null;
    for (const x of pontos) {
      if (x.mes <= mes) r = x;
      else break;
    }
    return r || pontos[0] || null;
  };
  return {
    tem: pontos.length > 0,
    custo: (mes) => Math.abs(num(em(mes)?.custo)),
    vendido: (mes) => {
      const x = em(mes);
      return x ? limitar(num(x.despesa) - num(x.distratada), 0, 1) : 0;
    },
  };
}

// Redutores do regime regular em R$ (antes de virar % da receita).
function redutores(p, config) {
  return num(config?.valor_terreno) + num(config?.unidades_residenciais) * p.redutor_residencial + num(config?.lotes) * p.redutor_lote;
}

// Um centro, mês a mês, nos meses da foto (`mensal.meses`).
//   `impostoIds`: as linhas de imposto fixo (o RET de hoje); `baseIds`: a base dele (a receita);
//   `config`: { regime, valor_terreno, unidades_residenciais, lotes, perc_custo_credito, irpj_csll } ou null.
// Devolve { rho, receita_total, meses: [{ mes, receita, imposto_hoje, ret, ibs_cbs, irpj_csll, credito }] }:
//   imposto_hoje = as linhas de imposto na projeção; ret = o que fica delas com a reforma (tudo, se o centro
//   não está configurado ou o mês é antes de INICIO; zero, se está); ibs_cbs, irpj_csll = os impostos novos
//   (negativos); credito = o crédito reconhecido no mês (positivo, abate o custo).
function calcularCentro({ mensal, poc, impostoIds, baseIds, parametros: p, config }) {
  const meses = mensal?.meses || [];
  const v = (id, k) => num(mensal.valores?.[id]?.[k]);
  const receita = meses.map((_, k) => baseIds.reduce((t, id) => t + v(id, k), 0));
  const receitaTotal = receita.reduce((t, x) => t + x, 0);
  const regime = config?.regime || null;
  const rho = regime === 'REGULAR' && receitaTotal > 0 ? limitar(redutores(p, config) / receitaTotal, 0, 1) : 0;
  const custo = serieCusto(poc);
  const percCredito = num(config?.perc_custo_credito) / 100;
  const irpj = num(config?.irpj_csll) / 100;

  let creditoAcumulado = 0;
  let reconhecidoAntes = 0;
  let anterior = mesAnterior(INICIO);
  const linhas = meses.map((mes, k) => {
    const R = receita[k];
    const impostoHoje = impostoIds.reduce((t, id) => t + v(id, k), 0);
    const linha = { mes, receita: R, imposto_hoje: impostoHoje, ret: impostoHoje, ibs_cbs: 0, irpj_csll: 0, credito: 0 };
    if (mes < INICIO || !regime) return linha;
    const a = aliquotaDoAno(p, Number(mes.slice(0, 4)));
    linha.ret = 0;
    if (regime === 'RET') {
      linha.ibs_cbs = (-R * p.ret_ibs_cbs) / 100;
      linha.irpj_csll = (-R * p.ret_irpj_csll) / 100;
      return linha;
    }
    const total = a ? a.total : 0;
    linha.ibs_cbs = (-R * (1 - rho) * total * (1 - p.reducao_imoveis / 100)) / 100;
    linha.irpj_csll = -R * irpj;
    if (custo.tem) {
      creditoAcumulado += (custo.custo(mes) - custo.custo(anterior)) * (total / 100) * percCredito;
      const reconhecido = creditoAcumulado * custo.vendido(mes);
      linha.credito = reconhecido - reconhecidoAntes;
      reconhecidoAntes = reconhecido;
    }
    anterior = mes;
    return linha;
  });
  return { rho, receita_total: receitaTotal, redutores: regime === 'REGULAR' ? redutores(p, config) : 0, meses: linhas };
}

// ---------------------------------------------------------------- DFC (caixa)
//
// Impacto DFC: o imposto sobre a receita pelo CAIXA, mês a mês, de INICIO em diante, nos dois cenários
// e na mesma base — os recebimentos de venda do DFC projetado (contas da aba Configurações DFC):
//   hoje      RET = −recebido × alíquota do RET da DRE, pago `prazo_recolhimento` meses depois;
//   RET (transição)  IBS/CBS e IRPJ/CSLL = −recebido × as alíquotas do RET de transição, no mesmo prazo;
//   REGULAR   débito  = recebido × (1 − ρ) × (CBS + IBS do mês) × (1 − redução dos imóveis)
//             crédito = pago nas contas de custo de obra × % do custo com crédito × (CBS + IBS do mês)
//                       (o crédito nasce no pagamento — é condicionado à extinção do imposto do fornecedor)
//             IRPJ/CSLL = −recebido × % do centro, no prazo de recolhimento
//             sem split payment: a recolher = débito − crédito − saldo credor, no prazo; o que sobrar
//               de crédito vira saldo credor (compensa nos meses seguintes ou, em RESSARCIR, volta ao
//               caixa `prazo_ressarcimento` meses depois);
//             com split payment (a partir de `split_inicio`): o débito é retido no próprio recebimento
//               (sai no mesmo mês) e o crédito vira saldo credor, que só volta por ressarcimento.
//   Sem regime: o imposto fica o de hoje.

const DFC_PADRAO = { prazo_recolhimento: 1, split_inicio: null, saldo_credor: 'COMPENSAR', prazo_ressarcimento: 2 };

function somarMeses(mes, k) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

const CAMPOS_DFC = ['recebimentos', 'pagamentos', 'imposto_hoje', 'ret', 'ibs_cbs', 'irpj_csll', 'ressarcimento', 'credito'];

// Um centro. `meses`: os meses-fato (contíguos, de INICIO ao último do DFC); `recebimentos` / `pagamentos`:
// Map mês -> valor positivo; `retHoje(mes)`: alíquota (%) do RET de hoje; `rho`: redutores ÷ receita.
// Devolve os meses de CAIXA (os fatos + os pagamentos que caem depois) com, em cada um, o recebido e o pago
// no mês (os fatos), os impostos pagos nele (negativos), o ressarcimento recebido (positivo), o crédito
// gerado no mês e o saldo credor no fim do mês; e o saldo credor que sobra no fim.
function calcularCentroDfc({ meses, recebimentos, pagamentos, retHoje, parametros: p, config, rho = 0, dfc }) {
  const fluxo = new Map();
  const em = (mes) => {
    if (!fluxo.has(mes)) fluxo.set(mes, { ...Object.fromEntries(CAMPOS_DFC.map((c) => [c, 0])), saldo_credor: null });
    return fluxo.get(mes);
  };
  const regime = config?.regime || null;
  const prazo = Number(dfc.prazo_recolhimento) || 0;
  let saldoCredor = 0;
  meses.forEach((mes) => {
    const R = recebimentos.get(mes) || 0;
    const P = pagamentos.get(mes) || 0;
    const x = em(mes);
    x.recebimentos += R;
    x.pagamentos += P;
    const pago = em(somarMeses(mes, prazo));
    const hoje = (-R * retHoje(mes)) / 100;
    pago.imposto_hoje += hoje;
    if (!regime) {
      pago.ret += hoje;
      return;
    }
    if (regime === 'RET') {
      pago.ibs_cbs += (-R * p.ret_ibs_cbs) / 100;
      pago.irpj_csll += (-R * p.ret_irpj_csll) / 100;
      return;
    }
    const a = aliquotaDoAno(p, Number(mes.slice(0, 4)));
    const total = a ? a.total : 0;
    const debito = R * (1 - rho) * (total / 100) * (1 - p.reducao_imoveis / 100);
    const credito = P * (num(config.perc_custo_credito) / 100) * (total / 100);
    x.credito += credito;
    pago.irpj_csll += -R * (num(config.irpj_csll) / 100);
    const split = Boolean(dfc.split_inicio) && mes >= dfc.split_inicio;
    if (split) {
      x.ibs_cbs += -debito;
      saldoCredor += credito;
    } else {
      const liquido = debito - credito - saldoCredor;
      if (liquido >= 0) {
        pago.ibs_cbs += -liquido;
        saldoCredor = 0;
      } else saldoCredor = -liquido;
    }
    if ((split || dfc.saldo_credor === 'RESSARCIR') && saldoCredor > 0.005) {
      em(somarMeses(mes, Number(dfc.prazo_ressarcimento) || 0)).ressarcimento += saldoCredor;
      saldoCredor = 0;
    }
    x.saldo_credor = saldoCredor;
  });
  return {
    saldo_credor_final: saldoCredor,
    meses: [...fluxo.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([mes, v]) => ({ mes, ...v })),
  };
}

module.exports = {
  INICIO,
  PADRAO,
  DFC_PADRAO,
  CAMPOS_DFC,
  IRPJ_CSLL_PADRAO,
  parametros,
  aliquotaDoAno,
  calcularCentro,
  calcularCentroDfc,
  mesAnterior,
  somarMeses,
  redutores,
};
