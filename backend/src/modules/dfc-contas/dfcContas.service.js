const pool = require('../../config/db');
const contasSienge = require('../contas-bancarias-sienge/contas.service');
const dfcSaldos = require('../dfc-saldos/dfcSaldos.service');

// DFC Construtoras > Contas Correntes: as contas bancárias da empresa no Sienge (endpoint
// v1/checking-accounts — a MESMA tabela e a mesma sincronização da tela Saldo de Contas Bancárias,
// contas_bancarias_sienge), com a flag "Projeta DFC". Mesmo modelo da aba Centros Custos.

// `classificacao`: nome da classificação da conta no cadastro (Saldo Contas Bancárias › Contas
// Bancárias) — o nível 1 do drilldown da aba; null = sem classificação.
const COLUNAS = `numero_conta, company_id, nome, tipo_id, tipo_descricao, agencia, banco_numero, banco_nome,
  company_name, status, projeta_dfc, atualizado_em,
  (SELECT cb.nome FROM classificacoes_bancarias cb WHERE cb.id = contas_bancarias_sienge.classificacao_id) AS classificacao`;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Todas as contas da empresa (ativas e inativas): empresa (company) › banco › conta.
async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS} FROM contas_bancarias_sienge WHERE empresa_id = $1
      ORDER BY company_name NULLS LAST, banco_nome NULLS LAST, numero_conta`,
    [empresaId]
  );
  return rows;
}

async function update(empresaId, companyId, numeroConta, { projeta_dfc: projetaDfc }) {
  const { rows } = await pool.query(
    `UPDATE contas_bancarias_sienge SET projeta_dfc = $4
      WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3
      RETURNING ${COLUNAS}`,
    [empresaId, companyId, numeroConta, projetaDfc]
  );
  if (!rows[0]) throw erro(404, 'Conta não encontrada nesta empresa.');
  return rows[0];
}

// Busca as contas no Sienge (mesma rotina da tela Saldo de Contas Bancárias). Não mexe no
// "Projeta DFC" das contas que já existem.
async function sincronizar(empresaId) {
  return contasSienge.gerar(empresaId);
}

// Configuração do saldo (engrenagem da aba): de onde vem o Saldo Inicial da aba DFC — ERP (extrato do Sienge,
// como sempre) ou HORIZON (o totalizador do Saldo Contas Bancárias, só no mês atual — dfc-saldos). A janela
// mostra o totalizador de agora com as três partes, para o usuário ver o que vai somar.
async function getConfigSaldo(empresaId) {
  const config = await dfcSaldos.configSaldo(empresaId);
  return { ...config, totalizador: await dfcSaldos.saldoHorizon(empresaId, config) };
}

async function salvarConfigSaldo(empresaId, usuarioId, dados) {
  const antes = await dfcSaldos.configSaldo(empresaId);
  await pool.query(
    `INSERT INTO dfc_saldo_config (empresa_id, tipo_saldo, soma_liberado, soma_cheque, soma_bloqueado, atualizado_por, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (empresa_id) DO UPDATE SET tipo_saldo = EXCLUDED.tipo_saldo, soma_liberado = EXCLUDED.soma_liberado,
       soma_cheque = EXCLUDED.soma_cheque, soma_bloqueado = EXCLUDED.soma_bloqueado,
       atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW()`,
    [empresaId, dados.tipo_saldo, dados.soma_liberado, dados.soma_cheque, dados.soma_bloqueado, usuarioId]
  );
  return { antes, depois: await getConfigSaldo(empresaId) };
}

module.exports = { list, update, sincronizar, getConfigSaldo, salvarConfigSaldo };
