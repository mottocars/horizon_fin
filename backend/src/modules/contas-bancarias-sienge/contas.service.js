const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const siengeApi = require('./sienge-api.client');
const bancosApi = require('./bancos-api.client');

function listBancos() {
  return bancosApi.getBancos();
}

// Mesma lógica de saldo-contas-bancarias/saldos.service.js (duplicada aqui de propósito —
// mesma convenção do resto do projeto de não compartilhar SQL entre módulos): banco "de
// verdade" da conta é o que o usuário escolheu na edição (banco_enriquecido) ou, na falta
// dele, o código que o Sienge traz em banco_numero.
const DIGITOS_BANCO_SQL = `REGEXP_REPLACE(banco_numero, '[^0-9]', '', 'g')`;
const BANCO_EFETIVO_SQL = `COALESCE(
  NULLIF(banco_enriquecido, ''),
  CASE WHEN banco_numero ~ '[0-9]' THEN
    CASE WHEN LENGTH(${DIGITOS_BANCO_SQL}) <= 3 THEN LPAD(${DIGITOS_BANCO_SQL}, 3, '0') ELSE ${DIGITOS_BANCO_SQL} END
  END
)`;

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
            company_id, company_name, status, classificacao_id,
            -- Nome da classificação pelo id (renomear no cadastro vale na hora).
            (SELECT cb.nome FROM classificacoes_bancarias cb WHERE cb.id = contas_bancarias_sienge.classificacao_id) AS classificacao,
            ${BANCO_EFETIVO_SQL} AS banco_codigo, criado_em, atualizado_em,
            -- Automação = tipo de convênio escolhido na edição da conta (VANPIX, ITAU,
            -- CNAB_MANUAL); NULL = sem convênio (saldo manual).
            tipo_convenio
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
    `SELECT *, (SELECT cb.nome FROM classificacoes_bancarias cb WHERE cb.id = contas_bancarias_sienge.classificacao_id) AS classificacao FROM contas_bancarias_sienge
     WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3`,
    [empresaId, companyId, numeroConta]
  );
  return rows[0] || null;
}

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const semZeros = (v) => String(v ?? '').trim().replace(/^0+/, '');

// Regras do tipo de convênio (o que cada um precisa pra casar a conta na abertura do período —
// ver saldo-contas-bancarias/vanpix-sync.service.js e cnab-manual.service.js). Campos de outro
// tipo são limpos: o que não aparece na tela não pode continuar valendo.
async function validarConvenio(empresaId, companyId, numeroConta, data) {
  const tipo = data.tipo_convenio || null;
  const banco = semZeros(data.banco_enriquecido);
  const temContaCompleta = Boolean(banco && data.conta_enriquecida && data.digito);

  if (tipo !== 'VANPIX') {
    data.codigo_cedente_extrato = null;
    data.codigo_cedente_cobranca = null;
  }
  if (tipo !== 'CNAB_MANUAL') data.codigo_beneficiario = null;

  if (tipo === 'VANPIX') {
    if (!data.codigo_cedente_extrato && !data.codigo_cedente_cobranca) {
      throw erro(400, 'Convênio VanPix: informe o código cedente de extrato bancário e/ou o de cobrança.');
    }
    if (data.codigo_cedente_extrato && !temContaCompleta) {
      throw erro(400, 'Convênio VanPix com extrato: preencha Banco, Conta e Dígito — é por eles que o saldo do extrato encontra a conta.');
    }
  }

  if (tipo === 'ITAU') {
    if (banco !== '341') throw erro(400, 'Convênio API Itaú: o banco da conta precisa ser 341 - Itaú.');
    if (!data.agencia_enriquecida || !data.conta_enriquecida || !data.digito) {
      throw erro(400, 'Convênio API Itaú: preencha Agência, Conta e Dígito — iguais aos da conexão API Itaú.');
    }
  }

  if (tipo === 'CNAB_MANUAL') {
    if (!temContaCompleta) {
      throw erro(400, 'CNAB 240 manual: preencha Banco, Conta e Dígito — é por eles que o arquivo de extrato encontra a conta.');
    }
    // Duas contas com o mesmo banco/conta/dígito receberiam o mesmo saldo do extrato (contado
    // duas vezes); o mesmo vale pro beneficiário na cobrança.
    const { rows: outras } = await pool.query(
      `SELECT nome, numero_conta, codigo_beneficiario,
              (COALESCE(NULLIF(LTRIM(banco_enriquecido, '0'), ''), LTRIM(REGEXP_REPLACE(banco_numero, '[^0-9]', '', 'g'), '0')) = $4
                AND LTRIM(conta_enriquecida, '0') = $5 AND digito = $6) AS mesma_conta
         FROM contas_bancarias_sienge
        WHERE empresa_id = $1 AND tipo_convenio = 'CNAB_MANUAL' AND NOT (company_id = $2 AND numero_conta = $3)`,
      [empresaId, companyId, numeroConta, banco, semZeros(data.conta_enriquecida), data.digito]
    );
    const mesmaConta = outras.find((o) => o.mesma_conta);
    if (mesmaConta) {
      throw erro(400, `Já existe outra conta CNAB 240 manual com este banco, conta e dígito: ${mesmaConta.nome || mesmaConta.numero_conta}. O saldo do extrato seria lançado nas duas.`);
    }
    const beneficiario = semZeros(data.codigo_beneficiario);
    const mesmoBeneficiario = beneficiario && outras.find((o) => semZeros(o.codigo_beneficiario) === beneficiario);
    if (mesmoBeneficiario) {
      throw erro(400, `O código do beneficiário ${data.codigo_beneficiario} já está na conta ${mesmoBeneficiario.nome || mesmoBeneficiario.numero_conta}. A cobrança seria somada nas duas.`);
    }
  }
}

async function updateEnriquecimento(empresaId, companyId, numeroConta, data) {
  if (data.classificacao_id) {
    const { rows: validas } = await pool.query(
      'SELECT 1 FROM classificacoes_bancarias WHERE empresa_id = $1 AND id = $2',
      [empresaId, data.classificacao_id]
    );
    if (!validas[0]) throw erro(400, 'Classificação inválida — cadastre-a primeiro na aba Classificação.');
  }
  await validarConvenio(empresaId, companyId, numeroConta, data);

  const { rows } = await pool.query(
    `UPDATE contas_bancarias_sienge SET
       banco_enriquecido = $1,
       agencia_enriquecida = $2,
       conta_enriquecida = $3,
       digito = $4,
       projeta_saldo = $5,
       classificacao_id = $6,
       codigo_cedente_cobranca = $10,
       codigo_cedente_extrato = $11,
       valor_cheque_especial = $12,
       tipo_convenio = $13,
       codigo_beneficiario = $14
     WHERE empresa_id = $7 AND company_id = $8 AND numero_conta = $9
     RETURNING *, (SELECT cb.nome FROM classificacoes_bancarias cb WHERE cb.id = contas_bancarias_sienge.classificacao_id) AS classificacao`,
    [
      data.banco_enriquecido || null,
      data.agencia_enriquecida || null,
      data.conta_enriquecida || null,
      data.digito || null,
      data.projeta_saldo ?? null,
      data.classificacao_id || null,
      empresaId,
      companyId,
      numeroConta,
      data.codigo_cedente_cobranca || null,
      data.codigo_cedente_extrato || null,
      data.valor_cheque_especial ?? null,
      data.tipo_convenio || null,
      data.codigo_beneficiario || null,
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

module.exports = { listContas, listBancos, gerar, getItem, updateEnriquecimento };
