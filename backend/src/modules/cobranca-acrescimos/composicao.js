// Composição do valor de uma parcela (o que a tela mostra ao clicar no valor da Rotina e da Gestão das
// Parcelas — pedido de 25/11/2026):
//   Valor Original | Valor Corrigido + Acréscimos + Multa + Juros − Desconto = Total
//
// - Em aberto: Corrigido = saldo corrigido da base; Acréscimos = o do Sienge (cobranca_parcelas_acrescimos,
//   só parcela vencida — o Sienge não separa multa e juros na parcela em aberto, então Multa/Juros = 0).
// - Paga: soma dos recebimentos (sie_income_recebimentos). Lá o acréscimo do Sienge (addition_amount) JÁ
//   INCLUI multa e juros (em 84% das baixas acréscimo = multa + juros), e o líquido é bruto + acréscimo −
//   desconto (conferido em todas as baixas de 2026). Para a conta fechar sem contar duas vezes, "Acréscimos"
//   aqui é só o que sobra do acréscimo além de multa e juros.
//   A regra completa do líquido (conferida nas 149 mil baixas da TOSTE e da GENESIS): bruto + acréscimo −
//   desconto + seguro + taxa adm. − impostos retidos. Impostos e seguro/taxa só aparecem quando existem.

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const CAMPOS = ['original', 'corrigido', 'acrescimos', 'multa', 'juros', 'desconto', 'impostos', 'seguro_taxa', 'total'];

function finalizar(c) {
  CAMPOS.forEach((k) => {
    c[k] = r2(c[k]);
  });
  return c;
}

// `acr`: { acrescimo, calculado_em } do Sienge (ou undefined). `vencida`: vencimento antes de hoje.
function aberta({ original, saldo, acr, vencida }) {
  const acrescimos = vencida && acr ? acr.acrescimo : 0;
  return finalizar({
    tipo: 'aberta',
    parcelas: 1,
    original,
    corrigido: saldo,
    acrescimos,
    multa: 0,
    juros: 0,
    desconto: 0,
    impostos: 0,
    seguro_taxa: 0,
    total: Number(saldo) + Number(acrescimos),
    calculado_em: vencida && acr ? acr.calculado_em : null,
    sem_calculo: Boolean(vencida && !acr && saldo > 0),
  });
}

// `rec`: somas dos recebimentos da parcela (colunas rec_* das consultas). Sem recebimento na base (baixa
// antiga não importada), cai no valor original — o que a coluna mostrava antes.
function paga({ original, rec }) {
  if (!rec || !Number(rec.rec_qtd)) {
    return finalizar({ tipo: 'paga', parcelas: 1, original, corrigido: original, acrescimos: 0, multa: 0, juros: 0, desconto: 0, impostos: 0, seguro_taxa: 0, total: original, pago_em: null });
  }
  const multa = Number(rec.rec_multa) || 0;
  const juros = Number(rec.rec_juros) || 0;
  return finalizar({
    tipo: 'paga',
    parcelas: 1,
    original,
    corrigido: rec.rec_bruto,
    acrescimos: (Number(rec.rec_acrescimo) || 0) - multa - juros,
    multa,
    juros,
    desconto: rec.rec_desconto,
    impostos: rec.rec_impostos,
    seguro_taxa: rec.rec_seguro_taxa,
    total: rec.rec_liquido,
    pago_em: rec.ultimo_pagamento || null,
  });
}

// Soma de várias composições (linhas de Centro de Custo, Cliente, Responsável). null se não houver nenhuma.
function somar(lista) {
  const validas = lista.filter(Boolean);
  if (!validas.length) return null;
  const soma = { tipo: 'soma', parcelas: 0, calculado_em: null, sem_calculo: 0 };
  CAMPOS.forEach((k) => {
    soma[k] = 0;
  });
  const tipos = new Set();
  for (const c of validas) {
    tipos.add(c.tipo === 'soma' ? c.tipo_base : c.tipo);
    soma.parcelas += c.parcelas || 1;
    CAMPOS.forEach((k) => {
      soma[k] += Number(c[k]) || 0;
    });
    if (c.calculado_em && (!soma.calculado_em || new Date(c.calculado_em) > new Date(soma.calculado_em))) soma.calculado_em = c.calculado_em;
    soma.sem_calculo += c.tipo === 'soma' ? c.sem_calculo || 0 : c.sem_calculo ? 1 : 0;
  }
  soma.tipo_base = tipos.size === 1 ? [...tipos][0] : 'misto';
  return finalizar(soma);
}

// Somador incremental (evita guardar listas grandes nos agrupamentos).
function somador() {
  const itens = [];
  return {
    add: (c) => c && itens.push(c),
    valor: () => somar(itens),
  };
}

// SQL do LATERAL com as somas dos recebimentos de uma parcela (alias `si` para sie_income). Pelo índice
// (bill_id, installment_id, empresa_id), como o MAX(payment_date) que já existia.
const LATERAL_RECEBIMENTOS = `LEFT JOIN LATERAL (
       SELECT MAX(r.payment_date) AS ultimo_pagamento, COUNT(*) AS rec_qtd,
              SUM(r.gross_amount) AS rec_bruto, SUM(r.addition_amount) AS rec_acrescimo,
              SUM(r.fine_amount) AS rec_multa, SUM(r.interest_amount) AS rec_juros,
              SUM(r.discount_amount) AS rec_desconto, SUM(r.tax_amount) AS rec_impostos,
              SUM(r.insurance_amount + r.due_adm_amount) AS rec_seguro_taxa, SUM(r.net_amount) AS rec_liquido
       FROM sie_income_recebimentos r
       WHERE r.bill_id = si.bill_id AND r.installment_id = si.installment_id AND r.empresa_id = si.empresa_id
     ) pg ON TRUE`;

module.exports = { aberta, paga, somar, somador, LATERAL_RECEBIMENTOS };
