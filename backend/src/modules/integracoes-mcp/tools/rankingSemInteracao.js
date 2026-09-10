const { z } = require('zod');
const pool = require('../../../config/db');

const ORIGIN_ID_PADRAO = 'CO';

// Mesmo balde de saldo (aberto/vencido/no mês/a vencer) usado em
// cobrancaClusters.service.js::SUBQUERY_SALDO_ABERTO — duplicado aqui de
// propósito (mesma convenção do projeto: sem dependência cruzada de SQL
// bruto entre módulos, só de funções já exportadas quando fazem sentido
// como unidade inteira, ver explicarCluster.js/resumoCarteira.js).
function subquerySaldoAberto(params) {
  params.push(ORIGIN_ID_PADRAO);
  return `(
    SELECT client_id,
      SUM(corrected_balance_amount) AS saldo_aberto,
      COALESCE(SUM(corrected_balance_amount) FILTER (WHERE due_date < CURRENT_DATE), 0) AS saldo_vencido
    FROM sie_income
    WHERE empresa_id = $1 AND corrected_balance_amount <> 0 AND origin_id = $${params.length}
    GROUP BY client_id
  )`;
}

async function buscar(empresaId, { limite, apenas_com_saldo_vencido }) {
  const params = [empresaId];
  const saldoSql = subquerySaldoAberto(params);
  // Índices calculados a partir de params.length (não fixos: subquerySaldoAberto
  // já consumiu $2 pra origin_id, então apenas_com_saldo_vencido/limite vêm
  // depois disso, nunca em $2/$3 fixo — foi exatamente esse hardcode que
  // causava "forneceu N parâmetros, mas comando preparado requer M" antes.
  params.push(apenas_com_saldo_vencido);
  const posApenasComSaldoVencido = params.length;
  params.push(limite);
  const posLimite = params.length;

  const { rows } = await pool.query(
    `WITH ultimo_contato AS (
       SELECT si.client_id, MAX(r.data_registro) AS ultimo_contato
       FROM regua_cobranca_historico_registros r
       JOIN sie_income si
         ON si.bill_id = r.bill_id AND si.installment_id = r.installment_id AND si.empresa_id = r.empresa_id
       WHERE r.empresa_id = $1
       GROUP BY si.client_id
     )
     SELECT sa.client_id, cc.client_name, cc.cluster,
            sa.saldo_aberto, sa.saldo_vencido,
            uc.ultimo_contato
     FROM ${saldoSql} sa
     JOIN cobranca_clientes_clusters cc ON cc.empresa_id = $1 AND cc.client_id = sa.client_id
     LEFT JOIN ultimo_contato uc ON uc.client_id = sa.client_id
     WHERE ($${posApenasComSaldoVencido}::boolean IS FALSE OR sa.saldo_vencido > 0)
     ORDER BY uc.ultimo_contato ASC NULLS FIRST
     LIMIT $${posLimite}`,
    params
  );

  return rows.map((r) => ({
    client_id: r.client_id,
    client_name: r.client_name,
    cluster: r.cluster,
    saldo_aberto: Number(r.saldo_aberto),
    saldo_vencido: Number(r.saldo_vencido),
    ultimo_contato: r.ultimo_contato,
    dias_sem_contato: r.ultimo_contato
      ? Math.floor((Date.now() - new Date(r.ultimo_contato).getTime()) / 86400000)
      : null,
  }));
}

module.exports = {
  name: 'ranking_clientes_sem_interacao',
  description:
    'Lista os clientes com contas a receber em aberto que estão há mais tempo sem nenhum registro de contato de ' +
    'cobrança (WhatsApp, e-mail, ligação ou anotação manual), incluindo quem nunca foi contatado (ultimo_contato ' +
    'nulo). Use para responder perguntas como "quais clientes inadimplentes ninguém está falando com eles", ' +
    '"ranking de clientes esquecidos pela cobrança" ou "há quanto tempo não conversamos com o cliente X". Retorna ' +
    'client_id, nome, cluster de risco, saldo em aberto, saldo vencido, a data do último contato e há quantos dias ' +
    'foi (dias_sem_contato).',
  inputSchema: {
    limite: z.coerce.number().int().min(1).max(200).default(20).describe('Quantidade máxima de clientes a retornar (1-200).'),
    apenas_com_saldo_vencido: z
      .boolean()
      .default(true)
      .describe('Se true (padrão), só considera clientes que têm alguma parcela vencida em aberto agora.'),
  },
  handler(empresaId) {
    return async (args) => {
      const rows = await buscar(empresaId, args);
      return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
    };
  },
};
