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

// 'AAAA-MM' + k meses.
function somarMeses(anoMes, k) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// REALIZADO do fluxo de caixa entre os meses `de` e `ate` ('AAAA-MM'), das contas com "Projeta DFC":
// - valores: soma do extrato achatado por rateio (sie_extrato_contas_rateio — montado na
//   sincronização) por centro de custo × natureza × mês, com entradas e saídas em linhas separadas:
//   [{ centro_id, sienge_id, mes, valor }] (centro/natureza null = lançamento sem rateio);
// - saldos: saldo real na abertura de cada mês de `de` até o mês seguinte a `ate` ({ 'AAAA-MM': valor });
// - extrato_ate: até quando o extrato foi buscado (o realizado só vai até ali).
async function realizado(empresaId, de, ate) {
  const { rows } = await pool.query(
    // Entradas e saídas somadas em separado (o fluxo de caixa mostra os dois lados — DfcFluxoTab).
    `SELECT r.centro_id, r.natureza_id AS sienge_id, to_char(r.mes, 'YYYY-MM') AS mes, ROUND(SUM(r.valor), 2) AS valor
       FROM sie_extrato_contas_rateio r
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = r.empresa_id AND c.company_id = r.company_id AND c.numero_conta = r.numero_conta AND c.projeta_dfc
      WHERE r.empresa_id = $1 AND r.mes BETWEEN $2::date AND $3::date
      GROUP BY 1, 2, 3, (r.valor >= 0)`,
    [empresaId, `${de}-01`, `${ate}-01`]
  );
  const { rows: porMes } = await pool.query(
    `SELECT to_char(date_trunc('month', e.date), 'YYYY-MM') AS mes, SUM(${VALOR_COM_SINAL}) AS valor
       FROM sie_extrato_contas e
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = e.empresa_id AND c.company_id = e.company_id AND c.numero_conta = e.numero_conta AND c.projeta_dfc
      WHERE e.empresa_id = $1 AND e.date IS NOT NULL
      GROUP BY 1 ORDER BY 1`,
    [empresaId]
  );
  const { rows: ateRows } = await pool.query(
    `SELECT MIN(s.data_ate) AS ate FROM sie_extrato_contas_sincronizacoes s
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = s.empresa_id AND c.company_id = s.company_id AND c.numero_conta = s.numero_conta AND c.projeta_dfc
      WHERE s.empresa_id = $1`,
    [empresaId]
  );
  // Saldo de abertura de cada mês = soma de todos os meses anteriores.
  const saldos = {};
  const fimSaldos = somarMeses(ate, 1);
  for (let m = de; m <= fimSaldos; m = somarMeses(m, 1)) {
    const total = porMes.filter((r) => r.mes < m).reduce((t, r) => t + Number(r.valor), 0);
    saldos[m] = Math.round(total * 100) / 100;
  }
  return {
    valores: rows.map((r) => ({ ...r, valor: Number(r.valor) })),
    saldos,
    extrato_ate: ateRows[0]?.ate || null,
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

module.exports = { ROTINA, saldos, realizado, base, atualizarBase, execucao };
