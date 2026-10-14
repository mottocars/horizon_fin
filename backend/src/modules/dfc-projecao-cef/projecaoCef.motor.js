// Motor da Projeção CEF — porte fiel de gera_projecao_cef.py (build_projecao / compute_cef_pf /
// build_obra_acum), que replica a aba "Projecao" da planilha (colunas A..AE — as letras ficam nos
// comentários pra conferir célula a célula). Função pura: recebe tudo pronto, não acessa o banco.
//
// Diferenças em relação ao script (decididas com o usuário em 14/10/2026):
// - Status Demanda Mínima (unidade que NÃO entra na amortização): assinatura <= Data da Demanda
//   Mínima (data exata) — no script era "assinatura no mesmo mês da DM".
// - % de obra acumulado: vem pronto (`obraAcumulado`, ver projecaoCef.service.js): Caixa (DCD) até
//   o mês anterior ao atual e Prevision (ou manual) do mês atual em diante — a mesma regra da linha
//   da obra em Avanços Obras. No script era DCD + avanço mensal do Prevision.
// - Vendas (colunas B, C, I, AD, AE) ficam de fora: não entram em nenhuma das saídas usadas.

// 'AAAA-MM' de uma data ('AAAA-MM-DD' ou Date).
function mesDe(data) {
  if (!data) return null;
  if (data instanceof Date) return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  return String(data).slice(0, 7);
}

function somarMeses(anoMes, n) {
  let [ano, mes] = anoMes.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + n;
  ano = Math.floor(total / 12);
  mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function mesesEntre(inicio, fim) {
  const meses = [];
  let m = mesDe(inicio);
  const ultimo = mesDe(fim);
  while (m <= ultimo && meses.length < 600) {
    meses.push(m);
    m = somarMeses(m, 1);
  }
  return meses;
}

function n(v) {
  return v === null || v === undefined || v === '' ? 0 : Number(v);
}

// compute_cef_pf — uma linha por unidade do Geral (sem o contrato da construtora).
function calcularUnidades(unidades, obraAcumulado, dataDemandaMinima, prazoRegistro) {
  return unidades.map((u) => {
    const fin = n(u.valor_financiamento);
    const ter = n(u.valor_terreno);
    const sub = n(u.valor_subsidio);
    const fgts = n(u.valor_fgts);
    const assinMes = mesDe(u.data_assinatura);
    // Sem registro ainda: projeta o registro pra assinatura + "Tempo Entre Assinatura e Registro".
    const regMes = u.data_registro ? mesDe(u.data_registro) : assinMes ? somarMeses(assinMes, Math.trunc(prazoRegistro || 0)) : null;
    // Mês do registro fora do ciclo conta como 0% (igual ao .get(r_mes, 0.0) do script).
    const pctObra = regMes && obraAcumulado.has(regMes) ? obraAcumulado.get(regMes) : 0;
    const vgf = fin + sub + fgts;
    const vgfMedicao = fin - ter + sub;
    const novoRegistroVista = ter + fgts;
    const novoRegistroMedicao = vgfMedicao * pctObra;
    const statusDm = Boolean(u.data_assinatura && dataDemandaMinima && String(u.data_assinatura).slice(0, 10) <= String(dataDemandaMinima).slice(0, 10));
    return {
      assinMes,
      regMes,
      vgf,
      vgfMedicao,
      totalNovoRegistro: novoRegistroMedicao + novoRegistroVista,
      statusDm,
    };
  });
}

/**
 * build_projecao.
 * @param {object} p  parâmetros em FRAÇÃO: { cto, tetoPj, coefGarantia, amortPj, taxaJuros,
 *                    dataDemandaMinima, dataInicio, dataFim, prazoRegistro }
 * @param {Array} unidades  linhas do Geral: { data_assinatura, data_registro, valor_financiamento,
 *                    valor_terreno, valor_subsidio, valor_fgts }
 * @param {Map<string, number>} obraAcumulado  'AAAA-MM' -> % obra acumulado (0 a 1) de cada mês do ciclo
 * @returns {Array} uma linha por mês do ciclo
 */
function projetar(p, unidades, obraAcumulado) {
  const meses = mesesEntre(p.dataInicio, p.dataFim);
  const dm = mesDe(p.dataDemandaMinima);
  const dmMais1 = somarMeses(dm, 1);
  const cef = calcularUnidades(unidades, obraAcumulado, p.dataDemandaMinima, p.prazoRegistro);

  const soma = () => new Map();
  const add = (mapa, k, v) => mapa.set(k, (mapa.get(k) || 0) + v);
  const assinQtd = soma();
  const vgfAssin = soma();
  const regQtd = soma();
  const vgfReg = soma();
  const vgfMed = soma();
  const novoReg = soma();
  const novoRegNdm = soma();
  cef.forEach((c) => {
    if (c.assinMes) {
      add(assinQtd, c.assinMes, 1);
      add(vgfAssin, c.assinMes, c.vgf);
    }
    if (c.regMes) {
      add(regQtd, c.regMes, 1);
      add(vgfReg, c.regMes, c.vgf);
      add(vgfMed, c.regMes, c.vgfMedicao);
      add(novoReg, c.regMes, c.totalNovoRegistro);
      if (c.statusDm) add(novoRegNdm, c.regMes, c.totalNovoRegistro);
    }
  });

  const linhas = [];
  let dPrev = 0;
  let xPrev = 0;
  let rPrev = false;
  let cumO = 0;
  let cumCred = 0;
  let cumRecomp = 0;
  meses.forEach((m) => {
    const D = obraAcumulado.get(m) || 0; // % obra executada (acumulado)
    const E = 1 - D; // % obra a executar
    const F = D - dPrev; // Δ % obra no mês
    const G = assinQtd.get(m) || 0;
    const J = vgfAssin.get(m) || 0;
    const K = regQtd.get(m) || 0;
    const N = vgfReg.get(m) || 0;
    const O = vgfMed.get(m) || 0; // VGF medição dos registrados no mês
    const P = novoReg.get(m) || 0; // Novo Registro
    const Q = cumO * F; // Medição (VGF medição já registrado × avanço do mês)
    const R = m >= dm; // Demanda atingida
    // Valor Máximo PJ / Crédito PJ
    let AB;
    if (m <= dm) AB = 0; // até o mês da demanda mínima: sem liberação
    else if (m === dmMais1) AB = p.tetoPj * F; // 1º mês após a DM: teto × avanço
    else AB = p.cto * F - Q; // demais: CTO × avanço − medição
    AB = Math.max(AB, 0);
    if (cumCred + AB > p.tetoPj) AB = Math.max(0, p.tetoPj - cumCred); // trava no teto
    const S = AB; // Crédito PJ
    const T = 0; // Recomposição
    const U = xPrev * p.taxaJuros; // Juros sobre o saldo devedor do mês anterior
    const V = novoRegNdm.get(m) || 0; // Novo registro que não amortiza (demanda mínima)
    const W = (P - V) * p.amortPj; // Amortização
    const X = xPrev + (S + T) - W; // Saldo devedor PJ
    cumO += O;
    cumCred += S;
    cumRecomp += T;
    const Y = cumO * E; // Mutuário PF
    const Z = p.tetoPj - (cumCred + cumRecomp) - cumO * E; // Mutuário PJ
    const AA = !rPrev && R; // Primeiro crédito PJ
    const AC = (X + Z) * p.coefGarantia; // Exposição garantia
    linhas.push({
      mes: m,
      pct_obra_executada: D,
      delta_pct_obra_mes: F,
      qtd_assinatura: G,
      vgf_assinatura: J,
      qtd_registro: K,
      vgf_registro: N,
      vgf_medicao: O,
      novo_registro: P,
      medicao: Q,
      demanda_atingida: R,
      credito_pj: S,
      juros: U,
      novo_registro_nao_amortizacao: V,
      amortizacao: W,
      saldo_devedor_pj: X,
      mutuario_pf: Y,
      mutuario_pj: Z,
      primeiro_cred_pj: AA,
      valor_maximo_pj: AB,
      exposicao_garantia: AC,
    });
    dPrev = D;
    xPrev = X;
    rPrev = R;
  });
  return linhas;
}

module.exports = { projetar, calcularUnidades, mesesEntre, mesDe, somarMeses };
