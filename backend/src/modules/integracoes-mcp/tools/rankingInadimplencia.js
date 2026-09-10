const { z } = require('zod');
const pool = require('../../../config/db');
const { condicaoCentroCusto } = require('../../cobranca-clusters/cobrancaClusters.service');

const ORIGIN_ID_PADRAO = 'CO';

async function buscar(empresaId, { limite, cluster, cost_center_id }) {
  const params = [empresaId, ORIGIN_ID_PADRAO];
  let filtroCluster = '';
  if (cluster) {
    params.push(cluster);
    filtroCluster = ` AND cc.cluster = $${params.length}`;
  }

  let filtroCentro = '';
  if (cost_center_id) {
    // condicaoCentroCusto espera o array de ids e usa `cc.empresa_id`/`cc.client_id`
    // como alias — mesmo apelido usado aqui na query principal (ver FROM abaixo).
    filtroCentro = ` AND ${condicaoCentroCusto(params, [cost_center_id])}`;
  }

  params.push(limite);

  const { rows } = await pool.query(
    `SELECT cc.client_id, cc.client_name, cc.cluster, cc.score,
            COALESCE(SUM(si.corrected_balance_amount) FILTER (WHERE si.due_date < CURRENT_DATE), 0) AS saldo_vencido,
            COALESCE(SUM(si.corrected_balance_amount), 0) AS saldo_aberto
     FROM cobranca_clientes_clusters cc
     JOIN sie_income si
       ON si.empresa_id = cc.empresa_id AND si.client_id = cc.client_id
       AND si.origin_id = $2 AND si.corrected_balance_amount <> 0
     WHERE cc.empresa_id = $1${filtroCluster}${filtroCentro}
     GROUP BY cc.client_id, cc.client_name, cc.cluster, cc.score
     HAVING COALESCE(SUM(si.corrected_balance_amount) FILTER (WHERE si.due_date < CURRENT_DATE), 0) > 0
     ORDER BY saldo_vencido DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((r) => ({
    client_id: r.client_id,
    client_name: r.client_name,
    cluster: r.cluster,
    score: r.score != null ? Number(r.score) : null,
    saldo_vencido: Number(r.saldo_vencido),
    saldo_aberto: Number(r.saldo_aberto),
  }));
}

module.exports = {
  name: 'ranking_maior_inadimplencia',
  description:
    'Lista os clientes com maior saldo vencido (inadimplência) em aberto, ordenados do maior para o menor. ' +
    'Opcionalmente filtra por cluster de risco (novo, bom, duvidoso, mau) e/ou por centro de custo ' +
    '(empreendimento/obra). Use para responder "quem são os maiores devedores", "top clientes inadimplentes do ' +
    'empreendimento X" ou "ranking de inadimplência do cluster mau".',
  inputSchema: {
    limite: z.coerce.number().int().min(1).max(200).default(20).describe('Quantidade máxima de clientes a retornar (1-200).'),
    cluster: z
      .enum(['novo', 'bom', 'duvidoso', 'mau'])
      .optional()
      .describe('Filtra só os clientes deste cluster de risco. Omitido = todos os clusters.'),
    cost_center_id: z
      .coerce.number()
      .int()
      .positive()
      .optional()
      .describe('Filtra só os clientes com alguma parcela neste centro de custo (empreendimento/obra) do Sienge.'),
  },
  handler(empresaId) {
    return async (args) => {
      const rows = await buscar(empresaId, args);
      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    };
  },
};
