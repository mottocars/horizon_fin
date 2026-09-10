const pool = require('../../config/db');

const BRASIL_API_URL = 'https://brasilapi.com.br/api/cnpj/v1';

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function consultarCnpj(cnpj) {
  const cnpjDigits = onlyDigits(cnpj);

  if (cnpjDigits.length !== 14) {
    const err = new Error('CNPJ inválido. Informe os 14 dígitos.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const response = await fetch(`${BRASIL_API_URL}/${cnpjDigits}`, {
    headers: { 'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)' },
  });

  if (response.status === 404) {
    const err = new Error('CNPJ não encontrado na Receita Federal.');
    err.status = 404;
    err.expose = true;
    throw err;
  }

  if (!response.ok) {
    const err = new Error('Não foi possível consultar o CNPJ no momento.');
    err.status = 502;
    err.expose = true;
    throw err;
  }

  const data = await response.json();

  return {
    cnpj: cnpjDigits,
    razao_social: data.razao_social || '',
    nome_fantasia: data.nome_fantasia || '',
    cep: onlyDigits(data.cep),
    logradouro: data.logradouro || '',
    numero: data.numero || '',
    complemento: data.complemento || '',
    bairro: data.bairro || '',
    cidade: data.municipio || '',
    estado: data.uf || '',
    telefone: data.ddd_telefone_1 || '',
    situacao_cadastral: data.descricao_situacao_cadastral || '',
    data_inicio_atividade: data.data_inicio_atividade || null,
  };
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(razao_social ILIKE $1 OR nome_fantasia ILIKE $1 OR cnpj ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT id, cnpj, razao_social, nome_fantasia, cidade, estado, situacao_cadastral, ativo, criado_em
     FROM empresas
     ${whereClause}
     ORDER BY razao_social ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM empresas ${whereClause}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / limit)),
    },
  };
}

async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM empresas WHERE id = $1', [id]);
  return rows[0] || null;
}

async function create(data) {
  const cnpjDigits = onlyDigits(data.cnpj);

  const { rows } = await pool.query(
    `INSERT INTO empresas
      (cnpj, razao_social, nome_fantasia, cep, logradouro, numero, complemento, bairro, cidade, estado, telefone, situacao_cadastral, data_inicio_atividade)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      cnpjDigits,
      data.razao_social,
      data.nome_fantasia || null,
      onlyDigits(data.cep) || null,
      data.logradouro || null,
      data.numero || null,
      data.complemento || null,
      data.bairro || null,
      data.cidade || null,
      data.estado || null,
      data.telefone || null,
      data.situacao_cadastral || null,
      data.data_inicio_atividade || null,
    ]
  );
  return rows[0];
}

async function update(id, data) {
  const { rows } = await pool.query(
    `UPDATE empresas SET
      razao_social = $1,
      nome_fantasia = $2,
      cep = $3,
      logradouro = $4,
      numero = $5,
      complemento = $6,
      bairro = $7,
      cidade = $8,
      estado = $9,
      telefone = $10
     WHERE id = $11
     RETURNING *`,
    [
      data.razao_social,
      data.nome_fantasia || null,
      onlyDigits(data.cep) || null,
      data.logradouro || null,
      data.numero || null,
      data.complemento || null,
      data.bairro || null,
      data.cidade || null,
      data.estado || null,
      data.telefone || null,
      id,
    ]
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE empresas SET ativo = $1 WHERE id = $2 RETURNING *`,
    [ativo, id]
  );
  return rows[0] || null;
}

async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM empresas WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { consultarCnpj, list, getById, create, update, setAtivo, remove };
