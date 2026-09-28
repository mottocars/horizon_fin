const pool = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');

const ACTIOON_LOGIN_URL = 'https://api.actioon.com.br/api/login';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR a.email ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`a.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`a.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.ativo, a.criado_em, a.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_actioon a
     JOIN empresas e ON e.id = a.empresa_id
     ${whereClause}
     ORDER BY a.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_actioon a
     JOIN empresas e ON e.id = a.empresa_id
     ${whereClause}`,
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
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.ativo, a.criado_em, a.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_actioon a
     JOIN empresas e ON e.id = a.empresa_id
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ empresa_id, email, password }) {
  const senhaEnc = encrypt(password);
  const { rows } = await pool.query(
    `INSERT INTO integracoes_actioon (empresa_id, email, senha_enc)
     VALUES ($1, $2, $3)
     RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
    [empresa_id, email, senhaEnc]
  );
  return rows[0];
}

async function update(id, { empresa_id, email, password }) {
  if (password) {
    const senhaEnc = encrypt(password);
    const { rows } = await pool.query(
      `UPDATE integracoes_actioon SET empresa_id = $1, email = $2, senha_enc = $3
       WHERE id = $4
       RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
      [empresa_id, email, senhaEnc, id]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE integracoes_actioon SET empresa_id = $1, email = $2
     WHERE id = $3
     RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
    [empresa_id, email, id]
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_actioon SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, email, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

// Só pra uso interno do teste de conexão/login — nunca exposto pela API
// pro frontend (que só vê os campos de listagem/edição via getById, sem a
// senha). Mesmo padrão de email.service.js::getCredenciais.
async function getCredenciais(id) {
  const { rows } = await pool.query('SELECT email, senha_enc FROM integracoes_actioon WHERE id = $1', [id]);
  const row = rows[0];
  if (!row) return null;
  return { email: row.email, senha: decrypt(row.senha_enc) };
}

// A integração ATIVA da empresa — usado pelos relatórios que consomem a
// API da Actioon (ver relatorio-empreendimentos-masa), mesmo espírito de
// construtorVendas.service.js::getCredenciaisAtivas.
async function getCredenciaisAtivas(empresaId) {
  const { rows } = await pool.query(
    'SELECT email, senha_enc FROM integracoes_actioon WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  const row = rows[0];
  if (!row) return null;
  return { email: row.email, senha: decrypt(row.senha_enc) };
}

// Login de verdade na API da Actioon (POST /api/login) — devolve o token
// (usado pelos relatórios pra chamar os demais endpoints autenticados) ou
// estoura badRequest com a mensagem da própria Actioon quando as
// credenciais estão erradas. A API responde 200 + { token } no sucesso,
// ou 401 + { error } quando erra a senha.
async function login(email, password) {
  let resposta;
  try {
    resposta = await fetch(ACTIOON_LOGIN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw badRequest('Não foi possível conectar à Actioon.');
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !corpo.token) {
    throw badRequest(corpo?.error || 'Credenciais inválidas.');
  }
  return corpo.token;
}

// Testa o login sem gravar nada — pensado pra rodar ANTES de salvar
// (formulário de Integrações > Actioon, ver ActioonForm.jsx), por isso
// recebe os campos crus em vez de um id — quando a senha vier em branco
// (editando sem trocar), busca a senha já salva pelo `id` informado,
// mesmo espírito de "editar sem repreencher mantém a senha atual" usado
// no `update`.
async function testarConexao({ id, email, password }) {
  let senhaFinal = password;
  if (!senhaFinal) {
    if (!id) throw badRequest('Informe a senha para testar a conexão.');
    const credenciaisAtuais = await getCredenciais(id);
    if (!credenciaisAtuais) throw badRequest('Conexão não encontrada.');
    senhaFinal = credenciaisAtuais.senha;
  }

  await login(email, senhaFinal);
  return { ok: true };
}

module.exports = { list, getById, create, update, setAtivo, testarConexao, login, getCredenciaisAtivas };
