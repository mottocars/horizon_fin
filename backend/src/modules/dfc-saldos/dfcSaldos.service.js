const pool = require('../../config/db');
const executor = require('../monitor-integracoes/executor');

// Saldos das contas bancárias com "Projeta DFC" (aba Contas Correntes), a partir do extrato do
// Sienge (sie_extrato_contas — rotina "Saldos das contas (Sienge)"): saldo numa data = soma dos
// lançamentos ANTES dela — entradas (type Income) somam, saídas (Expense) subtraem. É o Saldo
// Inicial do fluxo de caixa (aba DFC).

const ROTINA = 'dfc_saldos_contas';

// Valor com sinal de um lançamento: Income soma, Expense subtrai (o valor vem positivo da API).
const VALOR_COM_SINAL = `CASE WHEN lower(e.type) IN ('expense', 'despesa', 'saida', 'saída', 'debit', 'debito', 'débito') THEN -ABS(e.value)
            WHEN lower(e.type) IN ('income', 'receita', 'entrada', 'credit', 'credito', 'crédito') THEN ABS(e.value)
            ELSE COALESCE(e.value, 0) END`;

// Saldo de cada conta com "Projeta DFC" na abertura do dia `data` ('AAAA-MM-DD') e o total.
async function saldos(empresaId, data) {
  const { rows } = await pool.query(
    `SELECT c.company_id, c.numero_conta, c.nome, c.company_name, c.tipo_descricao, c.banco_nome,
            COALESCE(SUM(${VALOR_COM_SINAL}) FILTER (WHERE e.date < $2), 0) AS saldo,
            MAX(e.date) FILTER (WHERE e.date < $2) AS ultimo_lancamento,
            s.sincronizado_em, s.data_ate, s.lancamentos
       FROM contas_bancarias_sienge c
       LEFT JOIN sie_extrato_contas e
         ON e.empresa_id = c.empresa_id AND e.company_id = c.company_id AND e.numero_conta = c.numero_conta
       LEFT JOIN sie_extrato_contas_sincronizacoes s
         ON s.empresa_id = c.empresa_id AND s.company_id = c.company_id AND s.numero_conta = c.numero_conta
      WHERE c.empresa_id = $1 AND c.projeta_dfc
      GROUP BY c.company_id, c.numero_conta, c.nome, c.company_name, c.tipo_descricao, c.banco_nome,
               s.sincronizado_em, s.data_ate, s.lancamentos
      ORDER BY c.company_name NULLS LAST, c.numero_conta`,
    [empresaId, data]
  );
  const contas = rows.map((r) => ({ ...r, saldo: Number(r.saldo) }));
  return {
    data,
    total: Math.round(contas.reduce((t, c) => t + c.saldo, 0) * 100) / 100,
    contas,
    // Contas marcadas que ainda não foram buscadas no Sienge (saldo 0 por falta de extrato).
    sem_extrato: contas.filter((c) => !c.sincronizado_em).length,
  };
}

// Situação da base (janela "Gerar fluxo"): { parcelas (= contas buscadas), atualizado_em }.
async function base(empresaId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS contas, MIN(s.sincronizado_em) AS atualizado_em
       FROM sie_extrato_contas_sincronizacoes s
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = s.empresa_id AND c.company_id = s.company_id AND c.numero_conta = s.numero_conta AND c.projeta_dfc
      WHERE s.empresa_id = $1`,
    [empresaId]
  );
  return { parcelas: rows[0].contas, contas: rows[0].contas, atualizado_em: rows[0].atualizado_em };
}

async function atualizarBase(empresaId, usuarioId) {
  return executor.iniciar(empresaId, ROTINA, { origem: 'manual', usuarioId });
}

async function execucao(empresaId) {
  return executor.getExecucaoAtualOuUltima(empresaId, ROTINA);
}

module.exports = { ROTINA, saldos, base, atualizarBase, execucao };
