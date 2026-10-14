const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { fetchAllStatements, inicioDoMesAtual } = require('./extratoContas-api.client');

// Sincroniza o extrato (v1/accounts-statements) das contas com "Projeta DFC" (aba Contas Correntes
// do DFC Construtoras), conta a conta: busca a base completa da conta (01/01/2000 até o início do mês
// atual) e substitui a que estava gravada pra ela, numa transação por conta.

async function getIntegracaoAtiva(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  return rows[0] || null;
}

const v = (valor) => (valor === undefined ? null : valor);
const MAX_PARAMETROS_POR_QUERY = 60000;

const COLUNAS = [
  'empresa_id', 'company_id', 'numero_conta', 'id', 'value', 'date', 'document_number', 'description', 'document_id',
  'type', 'reconciliation_date', 'bill_id', 'installment_number', 'statement_origin', 'statement_type',
  'statement_type_notes', 'budget_categories',
];

function linha(empresaId, conta, r) {
  return [
    empresaId, conta.company_id, conta.numero_conta, v(r.id), v(r.value), v(r.date) || null, v(r.documentNumber),
    v(r.description), v(r.documentId), v(r.type), v(r.reconciliationDate) || null, v(r.billId), v(r.installmentNumber),
    v(r.statementOrigin), v(r.statementType), v(r.statementTypeNotes),
    r.budgetCategories === undefined ? null : JSON.stringify(r.budgetCategories),
  ];
}

// Grava os lançamentos de UMA conta (apaga os anteriores dela e reinsere, em lotes).
async function gravarConta(empresaId, conta, lancamentos, dataAte) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sie_extrato_contas WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3', [
      empresaId,
      conta.company_id,
      conta.numero_conta,
    ]);
    const linhas = lancamentos.map((r) => linha(empresaId, conta, r));
    const porLote = Math.floor(MAX_PARAMETROS_POR_QUERY / COLUNAS.length);
    for (let i = 0; i < linhas.length; i += porLote) {
      const lote = linhas.slice(i, i + porLote);
      let p = 0;
      const valores = lote.map(() => `(${COLUNAS.map(() => `$${++p}`).join(',')})`).join(',');
      await client.query(`INSERT INTO sie_extrato_contas (${COLUNAS.join(',')}) VALUES ${valores}`, lote.flat());
    }
    await client.query(
      `INSERT INTO sie_extrato_contas_sincronizacoes (empresa_id, company_id, numero_conta, data_ate, lancamentos, sincronizado_em)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (empresa_id, company_id, numero_conta) DO UPDATE SET
         data_ate = EXCLUDED.data_ate, lancamentos = EXCLUDED.lancamentos, sincronizado_em = EXCLUDED.sincronizado_em`,
      [empresaId, conta.company_id, conta.numero_conta, dataAte, lancamentos.length, new Date()]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Todas as contas com "Projeta DFC", uma a uma. `onProgress({ texto, paginaAtual, totalPaginas })`.
async function sincronizar(empresaId, onProgress) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const e = new Error('Esta empresa não possui uma integração com o Sienge ativa configurada.');
    e.status = 400;
    e.expose = true;
    throw e;
  }
  const { rows: contas } = await pool.query(
    `SELECT company_id, numero_conta, nome FROM contas_bancarias_sienge
      WHERE empresa_id = $1 AND projeta_dfc ORDER BY company_id, numero_conta`,
    [empresaId]
  );
  if (!contas.length) {
    const e = new Error('Nenhuma conta com "Projeta DFC" marcado (DFC Construtoras > Contas Correntes).');
    e.status = 400;
    e.expose = true;
    throw e;
  }
  const credenciais = { tenant: integracao.tenant, username: integracao.username, password: decrypt(integracao.password_enc) };
  const endDate = inicioDoMesAtual();
  let lancamentos = 0;
  for (let i = 0; i < contas.length; i += 1) {
    const conta = contas[i];
    const texto = `Conta ${i + 1} de ${contas.length}: ${conta.numero_conta}${conta.nome ? ` · ${conta.nome}` : ''}`;
    onProgress?.({ texto });
    const lista = await fetchAllStatements({
      ...credenciais,
      accountNumber: conta.numero_conta,
      companyId: conta.company_id,
      endDate,
      onPagina: (pagina, total) => onProgress?.({ texto, paginaAtual: pagina, totalPaginas: total }),
    });
    await gravarConta(empresaId, conta, lista, endDate);
    lancamentos += lista.length;
  }
  return { contas: contas.length, lancamentos, ate: endDate };
}

module.exports = { sincronizar, gravarConta };
