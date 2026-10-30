const pool = require('../../config/db');

// Tipos de baixa do contas a receber do Sienge (operation_type_id de sie_income_recebimentos —
// mesmos ids em todas as empresas).
const BAIXA_CANCELAMENTO = 3;
const BAIXA_REPARCELAMENTO = 4;
const BAIXA_SUBSTITUICAO = 5;
const BAIXA_DISTRATO = 7;

// Correção monetária das parcelas a receber (sie_income), por parcela, só nos centros com
// "Realiza DRE". Premissas (a partir da query que o usuário usava, corrigindo o que ela distorcia):
//   paga        — correção (monetary_correction_amount) das baixas em que o cliente pagou de fato:
//                 Recebimento, Adiantamento, Abatimento de adiantamento, Outros… Fora:
//   reparcelada — correção das baixas por Reparcelamento/Substituição: não entrou dinheiro, mas
//                 a parcela foi trocada por outras com o valor já corrigido (ex.: título 61 da
//                 TOSTE E DINIZ — 30 parcelas INCC viraram 1 parcela REAL com os R$ 31,8 mil de
//                 correção no principal). Fica numa coluna própria: é correção realizada, só que
//                 não paga — e se ficasse de fora sumiria (as parcelas novas não a mostram).
//   Distrato e Cancelamento ficam de fora: a parcela foi baixada sem pagamento, a correção
//   dela não foi recebida (a query antiga somava tudo).
//   em_aberto   — saldo corrigido − saldo (corrected_balance_amount − balance_amount) das parcelas
//                 com saldo: a correção já acumulada e ainda não recebida. Mantém o sinal (índice
//                 negativo, ex. IGP-M, dá correção negativa; a query antiga só pegava > 0).
// Sempre pela data de vencimento da parcela (pedido do usuário), só até o mês atual — nada de
// correção futura: paga, reparcelada e em aberto só das parcelas que vencem até o fim do mês atual.
// Uma parcela de 2027 paga adiantado ou reparcelada em 2025 só entra quando vencer (como na planilha
// do usuário; até 29/10/2026 era pela data da baixa e o centro 5 da TOSTE E DINIZ dava 568 mil em
// vez de 247 mil — 290 mil de reparcelamentos de 2025 de parcelas de 2027, 31 mil de antecipações).
// Todo tipo de documento entra (contrato, recibo, reembolso de encargos…): correção é correção.
// Centro de custo: o das categorias da parcela (sie_income_categorias), rateado pelo percentual
// quando uma parcela cai em mais de um centro — a query antiga, com DISTINCT, repetia a correção
// inteira em cada centro e juntava baixas diferentes de mesmo valor numa só.
// Primeiro dia do mês seguinte: tudo antes dele é "até o mês atual".
const LIMITE = "date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'";

// $1 = empresa; `filtros` = condições a mais (centro/cliente, com os parâmetros seguintes).
// Categorias e recebimentos entram por LATERAL (cada parcela busca os seus pelos índices
// idx_sie_income_*_parcela): com CTEs agregando a empresa inteira, estatística desatualizada fazia
// o Postgres estimar 1 linha e cruzar tudo com tudo (9 a 36 s pra TOSTE E DINIZ).
function sqlParcelas(filtros = []) {
  return `
  SELECT i.bill_id, i.installment_id, i.installment_number, i.document_identification_id, i.document_number,
         p.cost_center_id AS centro_id, i.client_id, i.client_name, i.main_unit, i.indexer_name,
         i.due_date, r.data_baixa,
         COALESCE(r.paga, 0) * p.peso AS paga,
         COALESCE(r.reparcelada, 0) * p.peso AS reparcelada,
         CASE WHEN i.balance_amount > 0 THEN i.corrected_balance_amount - i.balance_amount ELSE 0 END * p.peso AS em_aberto
    FROM sie_income i
    CROSS JOIN LATERAL (
      SELECT cost_center_id,
             COALESCE(SUM(financial_category_rate) / NULLIF(SUM(SUM(financial_category_rate)) OVER (), 0),
                      1.0 / COUNT(*) OVER ()) AS peso
        FROM sie_income_categorias c
       WHERE c.bill_id = i.bill_id AND c.installment_id = i.installment_id AND c.empresa_id = i.empresa_id
       GROUP BY cost_center_id
    ) p
    JOIN centros_custo_sienge cc ON cc.empresa_id = i.empresa_id AND cc.sienge_id = p.cost_center_id AND cc.realiza_dre
    CROSS JOIN LATERAL (
      SELECT SUM(monetary_correction_amount) FILTER (
               WHERE operation_type_id NOT IN (${BAIXA_CANCELAMENTO}, ${BAIXA_REPARCELAMENTO}, ${BAIXA_SUBSTITUICAO}, ${BAIXA_DISTRATO})
             ) AS paga,
             SUM(monetary_correction_amount) FILTER (
               WHERE operation_type_id IN (${BAIXA_REPARCELAMENTO}, ${BAIXA_SUBSTITUICAO})
             ) AS reparcelada,
             MAX(payment_date) FILTER (
               WHERE operation_type_id NOT IN (${BAIXA_CANCELAMENTO}, ${BAIXA_DISTRATO}) AND monetary_correction_amount <> 0
             ) AS data_baixa
        FROM sie_income_recebimentos r
       WHERE r.bill_id = i.bill_id AND r.installment_id = i.installment_id AND r.empresa_id = i.empresa_id
    ) r
   WHERE ${['i.empresa_id = $1', `i.due_date < ${LIMITE}`, ...filtros].join(' AND ')}`;
}

// Só as parcelas com alguma correção.
const COM_CORRECAO = 'paga <> 0 OR reparcelada <> 0 OR em_aberto <> 0';

function num(v) {
  return v === null || v === undefined ? 0 : Number(v);
}

// Todos os centros com "Realiza DRE" (mesmo os sem correção, como na aba Orçamento), cada um com os
// clientes que têm correção e os totais — as parcelas vêm sob demanda (parcelas()).
async function listar(empresaId) {
  const { rows: centros } = await pool.query(
    `SELECT sienge_id::int AS id, name AS nome
       FROM centros_custo_sienge
      WHERE empresa_id = $1 AND realiza_dre
      ORDER BY sienge_id::bigint`,
    [empresaId]
  );
  const { rows: clientes } = await pool.query(
    `SELECT centro_id::int AS centro_id, client_id::int AS id, MAX(client_name) AS nome,
            STRING_AGG(DISTINCT main_unit, ', ' ORDER BY main_unit) AS unidades,
            COUNT(*)::int AS parcelas,
            ROUND(SUM(paga), 2) AS paga, ROUND(SUM(reparcelada), 2) AS reparcelada, ROUND(SUM(em_aberto), 2) AS em_aberto
       FROM (${sqlParcelas()}) t
      WHERE ${COM_CORRECAO}
      GROUP BY 1, 2
      ORDER BY 3`,
    [empresaId]
  );
  const { rows: ultima } = await pool.query(
    `SELECT MAX(atualizado_em) AS em, to_char(CURRENT_DATE, 'YYYY-MM') AS ate_mes
       FROM sie_income WHERE empresa_id = $1`,
    [empresaId]
  );

  const porCentro = new Map(centros.map((c) => [c.id, { ...c, paga: 0, reparcelada: 0, em_aberto: 0, parcelas: 0, clientes: [] }]));
  clientes.forEach((k) => {
    const c = porCentro.get(k.centro_id);
    if (!c) return;
    const cliente = {
      id: k.id,
      nome: k.nome,
      unidades: k.unidades,
      parcelas: k.parcelas,
      paga: num(k.paga),
      reparcelada: num(k.reparcelada),
      em_aberto: num(k.em_aberto),
    };
    c.clientes.push(cliente);
    c.paga += cliente.paga;
    c.reparcelada += cliente.reparcelada;
    c.em_aberto += cliente.em_aberto;
    c.parcelas += cliente.parcelas;
  });

  return { centros: [...porCentro.values()], ultima_atualizacao: ultima[0].em, ate_mes: ultima[0].ate_mes };
}

// Parcelas com correção de um cliente num centro, por vencimento.
async function parcelas(empresaId, centroId, clienteId) {
  const { rows } = await pool.query(
    `SELECT bill_id::int AS titulo, installment_id::int AS parcela_id, installment_number AS parcela,
            TRIM(document_identification_id) AS documento, document_number AS documento_numero,
            main_unit AS unidade, indexer_name AS indexador,
            to_char(due_date, 'YYYY-MM-DD') AS vencimento, to_char(data_baixa, 'YYYY-MM-DD') AS data_baixa,
            ROUND(paga, 2) AS paga, ROUND(reparcelada, 2) AS reparcelada, ROUND(em_aberto, 2) AS em_aberto
       FROM (${sqlParcelas(['p.cost_center_id = $2', 'i.client_id = $3'])}) t
      WHERE ${COM_CORRECAO}
      ORDER BY due_date, bill_id, installment_id`,
    [empresaId, centroId, clienteId]
  );
  return rows.map((r) => ({ ...r, paga: num(r.paga), reparcelada: num(r.reparcelada), em_aberto: num(r.em_aberto) }));
}

module.exports = { listar, parcelas, sqlParcelas };
