const pool = require('../../config/db');
const executor = require('../monitor-integracoes/executor');

// Saldos das contas bancárias com "Projeta DFC" (aba Contas Correntes), a partir do extrato do
// Sienge (sie_extrato_contas — rotina "Saldos das contas (Sienge)"): saldo numa data = soma dos
// lançamentos ANTES dela — entradas (type Income) somam, saídas (Expense) subtraem. É o Saldo
// Inicial do fluxo de caixa (aba DFC).

const ROTINA = 'dfc_saldos_contas';

// ----------------------------------------------------------------------------- tipo de saldo (aba Contas › engrenagem)
// ERP = o saldo real pelo extrato do Sienge (abaixo, mês a mês). HORIZON = o totalizador da tela Saldo Contas
// Bancárias no 1º dia do mês atual (o primeiro dia do mês com saldo lançado, se o dia 1 não tiver — pedido do
// usuário, 26/11/2026; mesmo cálculo: resumoSaldos.calculo.js), somando só as partes
// marcadas — vira o Saldo Inicial do mês atual da aba DFC (os meses anteriores ficam sem saldo).
const CONFIG_PADRAO = { tipo_saldo: 'ERP', soma_liberado: true, soma_cheque: true, soma_bloqueado: false };

async function configSaldo(empresaId) {
  const { rows } = await pool.query(
    `SELECT tipo_saldo, soma_liberado, soma_cheque, soma_bloqueado, atualizado_em,
            (SELECT u.nome FROM usuarios u WHERE u.id = c.atualizado_por) AS atualizado_por_nome
       FROM dfc_saldo_config c WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows[0] || { ...CONFIG_PADRAO, atualizado_em: null, atualizado_por_nome: null };
}

// Relógio da aplicação (o do Postgres da VPS é deslocado).
function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// O totalizador do Saldo Contas Bancárias no 1º dia do mês atual com saldo lançado (do dia 1 até hoje; só as contas que entram na
// grade de lá: classificadas e com "Projeta saldo"). `valor` = soma das partes marcadas em `config`.
// { data: 'AAAA-MM-DD' | null, liberado, limite_cheque, bloqueado, valor }.
async function saldoHorizon(empresaId, config) {
  const saldosService = require('../saldo-contas-bancarias/saldos.service');
  const { calcularResumoSaldos, contribuicaoConta } = require('../saldo-contas-bancarias/resumoSaldos.calculo');
  const { rows } = await pool.query(
    `SELECT TO_CHAR(MIN(s.data), 'YYYY-MM-DD') AS data
       FROM saldos_contas_bancarias s
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = s.empresa_id AND c.company_id = s.company_id AND c.numero_conta = s.numero_conta
      WHERE s.empresa_id = $1 AND s.data BETWEEN $2 AND $3 AND c.projeta_saldo AND c.classificacao_id IS NOT NULL`,
    [empresaId, `${hojeIso().slice(0, 8)}01`, hojeIso()]
  );
  const data = rows[0]?.data || null;
  if (!data) return { data: null, liberado: 0, limite_cheque: 0, bloqueado: 0, valor: 0, contas: [] };
  const { contas, periodos } = await saldosService.getSaldos(empresaId, { dataInicio: data, dataFim: data });
  const diasPeriodo = new Set(periodos);
  const resumo = calcularResumoSaldos(contas, [data], diasPeriodo);
  const liberado = resumo.liberado[data] || 0;
  const limiteCheque = resumo.limiteCheque[data] || 0;
  const bloqueado = resumo.bloqueado[data] || 0;
  const soma = (l, c, b) => (config.soma_liberado ? l : 0) + (config.soma_cheque ? c : 0) + (config.soma_bloqueado ? b : 0);
  const valor = soma(liberado, limiteCheque, bloqueado);
  // Cada conta com o quanto ela entra no totalizador (mesma conta do resumo, em centavos) — a "Carteira e
  // liquidez" do dashboard Fluxo de Caixa por classificação › conta; somadas, dão o `valor`.
  const { rows: tipos } = await pool.query(
    'SELECT company_id, numero_conta, tipo_descricao FROM contas_bancarias_sienge WHERE empresa_id = $1',
    [empresaId]
  );
  const tipoDe = new Map(tipos.map((t) => [`${t.company_id}|${t.numero_conta}`, t.tipo_descricao]));
  const porConta = contas
    .map((c) => {
      const p = contribuicaoConta(c, data, diasPeriodo);
      if (!p) return null;
      return {
        company_id: c.company_id,
        company_name: c.company_name,
        numero_conta: c.numero_conta,
        nome: c.nome,
        tipo_descricao: tipoDe.get(`${c.company_id}|${c.numero_conta}`) || null,
        classificacao: c.classificacao,
        liberado: p.liberado / 100,
        limite_cheque: p.limiteCheque / 100,
        bloqueado: p.bloqueado / 100,
        saldo: soma(p.liberado, p.limiteCheque, p.bloqueado) / 100,
      };
    })
    .filter(Boolean);
  return { data, liberado, limite_cheque: limiteCheque, bloqueado, valor: Math.round(valor * 100) / 100, contas: porConta };
}

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

const semContas = ({ contas, ...resto }) => resto; // eslint-disable-line no-unused-vars

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
// - extrato_ate: até quando o extrato foi buscado (o realizado só vai até ali);
// - realizado_ate: o último mês com realizado ('AAAA-MM') — versões da DFC (pedido do usuário, 25/11/2026): o
//   realizado vai só até o fim do mês anterior ao atual (ou o corte da versão lida); do mês seguinte em diante,
//   só projeção. `ate` é limitado a ele; os saldos vão até a abertura do mês seguinte (de onde a projeção parte).
async function realizado(empresaId, de, ateFiltro) {
  const realizadoAte = require('../dfc-versoes/contexto').limiteRealizado();
  const ate = ateFiltro > realizadoAte ? realizadoAte : ateFiltro;
  if (de > ate) de = ate; // eslint-disable-line no-param-reassign
  const { rows } = await pool.query(
    // Entradas e saídas somadas em separado (o fluxo de caixa mostra os dois lados — DfcFluxoTab).
    // Conta assumida por máscaras detalhadas por tipo de parcela (aba Máscaras): o valor vem separado
    // pelo tipo da parcela que gerou o lançamento (recebimento do contas a receber — origem CR do
    // extrato — achado em sie_income pelo título e parcela). Sem parcela = tipo '' (SEM TIPO DE PARCELA).
    // Nas demais contas, tipo_parcela = ''.
    `WITH assumidas AS (
       SELECT DISTINCT parcela_conta_sienge_id AS conta FROM dfc_mascaras
        WHERE empresa_id = $1 AND tipo_detalhamento = 'TIPO_PARCELA' AND parcela_conta_sienge_id IS NOT NULL
     )
     SELECT r.centro_id, r.natureza_id AS sienge_id, COALESCE(t.tipo, '') AS tipo_parcela,
            to_char(r.mes, 'YYYY-MM') AS mes, ROUND(SUM(r.valor), 2) AS valor
       FROM sie_extrato_contas_rateio r
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = r.empresa_id AND c.company_id = r.company_id AND c.numero_conta = r.numero_conta AND c.projeta_dfc
       LEFT JOIN assumidas a ON a.conta = r.natureza_id
       LEFT JOIN LATERAL (
         SELECT btrim(i.payment_term_id) AS tipo
           FROM sie_extrato_contas e
           JOIN sie_income i ON i.empresa_id = e.empresa_id AND i.bill_id = e.bill_id AND i.installment_id = e.installment_number
          WHERE a.conta IS NOT NULL AND e.registro_id = r.registro_id AND e.statement_origin = 'CR'
          LIMIT 1
       ) t ON TRUE
      WHERE r.empresa_id = $1 AND r.mes BETWEEN $2::date AND $3::date
      GROUP BY 1, 2, 3, 4, (r.valor >= 0)`,
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
  // Tipo de saldo HORIZON: o Saldo Inicial do mês atual vem do totalizador do Saldo Contas Bancárias
  // (dfc-fluxo/fluxo.service.js e DfcFluxoTab.jsx usam `saldo_horizon` no lugar de `saldos`).
  const config = await configSaldo(empresaId);
  return {
    valores: rows.map((r) => ({ ...r, valor: Number(r.valor) })),
    saldos,
    extrato_ate: ateRows[0]?.ate || null,
    realizado_ate: realizadoAte,
    tipo_saldo: config.tipo_saldo,
    // Sem a lista por conta (só o dashboard Fluxo de Caixa usa — fluxoCaixaPainel chama saldoHorizon).
    saldo_horizon: config.tipo_saldo === 'HORIZON' ? semContas(await saldoHorizon(empresaId, config)) : null,
  };
}

// Saldo de abertura de cada conta com "Projeta DFC" em cada mês de `meses` ('AAAA-MM', em ordem) —
// aba "Saldos das Contas" da exportação Excel. [{ company_id, numero_conta, nome, company_name,
// tipo_descricao, banco_nome, ultimo_lancamento, sincronizado_em, data_ate, saldos: { mes: valor } }].
async function saldosPorConta(empresaId, meses) {
  const { rows: contas } = await pool.query(
    `SELECT c.company_id, c.numero_conta, c.nome, c.company_name, c.tipo_descricao, c.banco_nome,
            s.sincronizado_em, s.data_ate,
            (SELECT cb.nome FROM classificacoes_bancarias cb WHERE cb.id = c.classificacao_id) AS classificacao
       FROM contas_bancarias_sienge c
       LEFT JOIN sie_extrato_contas_sincronizacoes s
         ON s.empresa_id = c.empresa_id AND s.company_id = c.company_id AND s.numero_conta = c.numero_conta
      WHERE c.empresa_id = $1 AND c.projeta_dfc
      ORDER BY c.company_name NULLS LAST, c.numero_conta`,
    [empresaId]
  );
  const { rows: porMes } = await pool.query(
    `SELECT e.company_id, e.numero_conta, to_char(date_trunc('month', e.date), 'YYYY-MM') AS mes,
            SUM(${VALOR_COM_SINAL}) AS valor, MAX(e.date) AS ultimo
       FROM sie_extrato_contas e
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = e.empresa_id AND c.company_id = e.company_id AND c.numero_conta = e.numero_conta AND c.projeta_dfc
      WHERE e.empresa_id = $1 AND e.date IS NOT NULL
      GROUP BY 1, 2, 3`,
    [empresaId]
  );
  return contas.map((c) => {
    const movimentos = porMes.filter((r) => r.company_id === c.company_id && r.numero_conta === c.numero_conta);
    const saldos = {};
    meses.forEach((m) => {
      const total = movimentos.filter((r) => r.mes < m).reduce((t, r) => t + Number(r.valor), 0);
      saldos[m] = Math.round(total * 100) / 100;
    });
    const ultimo = movimentos.reduce((u, r) => (!u || r.ultimo > u ? r.ultimo : u), null);
    return { ...c, ultimo_lancamento: ultimo, saldos };
  });
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

module.exports = { ROTINA, CONFIG_PADRAO, configSaldo, saldoHorizon, saldos, saldosPorConta, realizado, base, atualizarBase, execucao };
