const pool = require('../../config/db');
const contasSienge = require('../contas-bancarias-sienge/contas.service');

// DFC Construtoras > Contas Correntes: as contas bancárias da empresa no Sienge (endpoint
// v1/checking-accounts — a MESMA tabela e a mesma sincronização da tela Saldo de Contas Bancárias,
// contas_bancarias_sienge), com a flag "Projeta DFC". Mesmo modelo da aba Centros Custos.

const COLUNAS = `numero_conta, company_id, nome, tipo_id, tipo_descricao, agencia, banco_numero, banco_nome,
  company_name, status, projeta_dfc, atualizado_em`;

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

module.exports = { list, update, sincronizar };
