const pool = require('../../config/db');
const executor = require('../monitor-integracoes/executor');

// Aging do Sienge pro Orçamento do DFC (pedido do usuário, mesmas contas das queries que ele usava
// à mão), a partir das bases sincronizadas pelo Monitor de Integrações:
// - receber: contas a receber (sie_income + sie_income_categorias) — rotina "Base do contas a
//   receber (Sienge)", a mesma da Gestão de Cobranças. Valor = original − desconto + taxas.
// - pagar: contas a pagar (sie_outcome + sie_outcome_categorias) — rotina "Base do contas a pagar
//   (Sienge)". Valor = original + desconto − taxas, lançado NEGATIVO (saída, mesma convenção da
//   Projeção CEF).
// Cada parcela cai no mês do vencimento (due_date), rateada pela natureza financeira e pelo centro
// de custo (financial_category_rate %). `filtro`: condição extra nas parcelas (alias `i`).
const TIPOS = {
  receber: {
    rotina: 'cobranca_base',
    parcelas: 'sie_income',
    categorias: 'sie_income_categorias',
    valor: '(COALESCE(i.original_amount, 0) - COALESCE(i.discount_amount, 0) + COALESCE(i.tax_amount, 0))',
    sinal: 1,
    filtro: 'TRUE',
  },
  pagar: {
    rotina: 'dfc_contas_pagar_base',
    parcelas: 'sie_outcome',
    categorias: 'sie_outcome_categorias',
    valor: '(COALESCE(i.original_amount, 0) + COALESCE(i.discount_amount, 0) - COALESCE(i.tax_amount, 0))',
    sinal: -1,
    // Previsões financeiras não entram (pedido do usuário): o documento real que a substitui já
    // está no contas a pagar — contar as duas duplicava o valor.
    filtro: "COALESCE(i.document_identification_name, '') NOT ILIKE '%PREVISÃO%'",
  },
};

// Valores do Aging: só o par centro / conta em que a conta tem Origem Projeção "SIENGE - AGING" (e
// "Projeta DFC" marcado) no plano que o centro usa — o próprio, se tiver, senão o Global — e só
// centros com "Projeta DFC". Calculado na hora, direto da base sincronizada.
async function aging(empresaId, tipo) {
  const t = TIPOS[tipo];
  const { rows } = await pool.query(
    `WITH centros AS (
       SELECT c.sienge_id AS centro_id,
              EXISTS (SELECT 1 FROM dfc_plano_contas_versoes v
                       WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id) AS proprio
         FROM centros_custo_sienge c
        WHERE c.empresa_id = $1 AND c.projeta_dfc
     ),
     contas AS (
       SELECT ce.centro_id, g.sienge_id
         FROM centros ce
         JOIN dfc_plano_contas g ON g.empresa_id = $1
        WHERE NOT ce.proprio AND g.origem_projecao = 'SIENGE_AGING' AND g.projeta_dfc
       UNION ALL
       SELECT ce.centro_id, p.sienge_id
         FROM centros ce
         JOIN dfc_plano_contas_centro p ON p.empresa_id = $1 AND p.centro_id = ce.centro_id
        WHERE ce.proprio AND p.origem_projecao = 'SIENGE_AGING' AND p.projeta_dfc
     )
     SELECT ct.centro_id, ct.sienge_id AS conta, to_char(i.due_date, 'YYYY-MM') AS mes,
            ROUND(SUM(${t.valor} * COALESCE(cat.financial_category_rate, 0) / 100), 2) AS valor
       FROM contas ct
       JOIN ${t.categorias} cat
         ON cat.empresa_id = $1 AND cat.cost_center_id = ct.centro_id AND cat.financial_category_id = ct.sienge_id::text
       JOIN ${t.parcelas} i
         ON i.empresa_id = cat.empresa_id AND i.bill_id = cat.bill_id AND i.installment_id = cat.installment_id
      WHERE i.due_date IS NOT NULL AND ${t.filtro}
      GROUP BY 1, 2, 3`,
    [empresaId]
  );
  const valores = rows.map((r) => ({ ...r, valor: Number(r.valor) * t.sinal })).filter((r) => r.valor !== 0);

  const { rows: base } = await pool.query(
    `SELECT count(*)::int AS parcelas, MAX(atualizado_em) AS atualizado_em FROM ${t.parcelas} WHERE empresa_id = $1`,
    [empresaId]
  );
  return { valores, base: base[0] };
}

// "Atualizar" na janela Projeções: dispara a rotina do Monitor de Integrações daquela base (em
// segundo plano, fica no histórico do Monitor). Devolve a execução, pra acompanhar por `execucao`.
async function atualizarBase(empresaId, tipo, usuarioId) {
  return executor.iniciar(empresaId, TIPOS[tipo].rotina, { origem: 'manual', usuarioId });
}

// Execução em andamento (com o progresso ao vivo) ou a última registrada.
async function execucao(empresaId, tipo) {
  return executor.getExecucaoAtualOuUltima(empresaId, TIPOS[tipo].rotina);
}

module.exports = { TIPOS, aging, atualizarBase, execucao };
