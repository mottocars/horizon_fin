const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const siengeApi = require('./sienge-api.client');

async function listGerados() {
  const { rows } = await pool.query(
    `SELECT e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj,
            COUNT(c.numero_conta)::int AS total_contas,
            MAX(c.atualizado_em) AS atualizado_em
     FROM contas_bancarias_sienge c
     JOIN empresas e ON e.id = c.empresa_id
     GROUP BY e.id, e.razao_social, e.nome_fantasia, e.cnpj
     ORDER BY e.razao_social ASC`
  );
  return rows;
}

function buildContasWhere(empresaId, { search, status, companyIds }) {
  const params = [empresaId, `%${search}%`];
  let where = 'empresa_id = $1 AND (nome ILIKE $2 OR numero_conta ILIKE $2 OR banco_nome ILIKE $2)';

  if (status?.length) {
    params.push(status);
    where += ` AND status = ANY($${params.length}::text[])`;
  }
  if (companyIds?.length) {
    params.push(companyIds);
    where += ` AND company_id = ANY($${params.length}::int[])`;
  }

  return { where, params };
}

async function listContas(empresaId, { page = 1, limit = 15, search = '', status = [], companyIds = [] }) {
  const offset = (page - 1) * limit;
  const { where, params } = buildContasWhere(empresaId, { search, status, companyIds });

  const { rows } = await pool.query(
    `SELECT numero_conta, nome, tipo_id, tipo_descricao, agencia, banco_numero, banco_nome,
            company_id, company_name, status, criado_em, atualizado_em
     FROM contas_bancarias_sienge
     WHERE ${where}
     ORDER BY numero_conta ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM contas_bancarias_sienge WHERE ${where}`,
    params
  );

  // Opções do filtro de empresa: todas as empresas do Sienge que têm conta
  // importada, independente dos filtros aplicados (senão a lista encolheria
  // conforme o usuário filtra).
  const { rows: empresas } = await pool.query(
    `SELECT company_id, MAX(company_name) AS company_name
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1
     GROUP BY company_id
     ORDER BY MAX(company_name) ASC NULLS LAST, company_id ASC`,
    [empresaId]
  );

  return {
    data: rows,
    empresas,
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / limit)),
    },
  };
}

async function getItem(empresaId, companyId, numeroConta) {
  const { rows } = await pool.query(
    `SELECT * FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3`,
    [empresaId, companyId, numeroConta]
  );
  return rows[0] || null;
}

async function updateEnriquecimento(empresaId, companyId, numeroConta, data) {
  const { rows } = await pool.query(
    `UPDATE contas_bancarias_sienge SET
       banco_enriquecido = $1,
       agencia_enriquecida = $2,
       conta_enriquecida = $3,
       digito = $4,
       projeta_saldo = $5,
       saldo_inicial = $6,
       data_saldo_inicial = $7
     WHERE empresa_id = $8 AND company_id = $9 AND numero_conta = $10
     RETURNING *`,
    [
      data.banco_enriquecido || null,
      data.agencia_enriquecida || null,
      data.conta_enriquecida || null,
      data.digito || null,
      data.projeta_saldo ?? null,
      data.saldo_inicial ?? null,
      data.data_saldo_inicial || null,
      empresaId,
      companyId,
      numeroConta,
    ]
  );
  return rows[0] || null;
}

async function getEmpresaComIntegracao(empresaId) {
  const { rows } = await pool.query(
    `SELECT e.id AS empresa_id, e.razao_social,
            s.tenant, s.username, s.password_enc
     FROM empresas e
     JOIN integracoes_sienge s ON s.empresa_id = e.id AND s.ativo = TRUE
     WHERE e.id = $1`,
    [empresaId]
  );
  return rows[0] || null;
}

async function upsertContas(empresaId, contas) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const conta of contas) {
      await client.query(
        `INSERT INTO contas_bancarias_sienge
           (numero_conta, empresa_id, company_id, nome, tipo_id, tipo_descricao, agencia,
            banco_numero, banco_nome, company_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (numero_conta, empresa_id, company_id) DO UPDATE SET
           nome = EXCLUDED.nome,
           tipo_id = EXCLUDED.tipo_id,
           tipo_descricao = EXCLUDED.tipo_descricao,
           agencia = EXCLUDED.agencia,
           banco_numero = EXCLUDED.banco_numero,
           banco_nome = EXCLUDED.banco_nome,
           company_name = EXCLUDED.company_name,
           status = EXCLUDED.status`,
        [
          conta.accountNumber,
          empresaId,
          conta.companyId,
          conta.accountName || null,
          conta.accountType?.id || null,
          conta.accountType?.description || null,
          conta.agencyNumber || null,
          conta.bankNumber || null,
          conta.bankName || null,
          conta.companyName || null,
          conta.accountStatus || null,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function gerar(empresaId) {
  const empresa = await getEmpresaComIntegracao(empresaId);
  if (!empresa) {
    const err = new Error('Esta empresa não possui uma integração Sienge ativa configurada.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const password = decrypt(empresa.password_enc);
  const contas = await siengeApi.fetchAllCheckingAccounts({
    tenant: empresa.tenant,
    username: empresa.username,
    password,
  });

  await upsertContas(empresaId, contas);

  return { empresa_id: empresaId, total_importado: contas.length };
}

module.exports = { listGerados, listContas, gerar, getItem, updateEnriquecimento };
