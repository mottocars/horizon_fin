const pool = require('../../config/db');
const executor = require('../monitor-integracoes/executor');

// Rotina do Monitor de Integrações que carrega a base do contas a receber do Sienge (sie_income +
// sie_income_categorias) — a mesma da Gestão de Cobranças. O Aging a receber do DFC sai dela.
const ROTINA_BASE_RECEBER = 'cobranca_base';

// Aging a receber pro Orçamento (pedido do usuário, mesma conta da query que ele usava à mão):
// cada parcela do contas a receber cai no mês do vencimento (due_date), com o valor
// original − desconto + taxas, rateado pela natureza financeira e pelo centro de custo
// (financial_category_rate %). Só entra o par centro / conta em que a conta tem Origem Projeção
// "SIENGE - AGING" (e "Projeta DFC" marcado) no plano que o centro usa — o próprio, se tiver, senão
// o Global — e só centros com "Projeta DFC". Calculado na hora, direto da base sincronizada.
async function receber(empresaId) {
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
            ROUND(SUM((COALESCE(i.original_amount, 0) - COALESCE(i.discount_amount, 0) + COALESCE(i.tax_amount, 0))
                      * COALESCE(cat.financial_category_rate, 0) / 100), 2) AS valor
       FROM contas ct
       JOIN sie_income_categorias cat
         ON cat.empresa_id = $1 AND cat.cost_center_id = ct.centro_id AND cat.financial_category_id = ct.sienge_id::text
       JOIN sie_income i
         ON i.empresa_id = cat.empresa_id AND i.bill_id = cat.bill_id AND i.installment_id = cat.installment_id
      WHERE i.due_date IS NOT NULL
      GROUP BY 1, 2, 3`,
    [empresaId]
  );
  const valores = rows.map((r) => ({ ...r, valor: Number(r.valor) })).filter((r) => r.valor !== 0);

  const { rows: base } = await pool.query(
    'SELECT count(*)::int AS parcelas, MAX(atualizado_em) AS atualizado_em FROM sie_income WHERE empresa_id = $1',
    [empresaId]
  );
  return { valores, base: base[0] };
}

// "Atualizar" na janela Projeções: dispara a mesma rotina do Monitor de Integrações (em segundo
// plano, fica no histórico do Monitor). Devolve a execução, pra acompanhar por `execucao`.
async function atualizarBase(empresaId, usuarioId) {
  return executor.iniciar(empresaId, ROTINA_BASE_RECEBER, { origem: 'manual', usuarioId });
}

// Execução em andamento (com o progresso ao vivo) ou a última registrada.
async function execucao(empresaId) {
  return executor.getExecucaoAtualOuUltima(empresaId, ROTINA_BASE_RECEBER);
}

module.exports = { receber, atualizarBase, execucao };
