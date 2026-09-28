const pool = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');
const { Client } = require('pg');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR b.nome_conexao ILIKE $1 OR b.host ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`b.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`b.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT b.id, b.nome_conexao, b.sgbd, b.host, b.porta, b.banco, b.usuario, b.ssl, b.ativo, b.criado_em, b.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_banco_dados b
     JOIN empresas e ON e.id = b.empresa_id
     ${whereClause}
     ORDER BY b.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_banco_dados b
     JOIN empresas e ON e.id = b.empresa_id
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
    `SELECT b.id, b.nome_conexao, b.sgbd, b.host, b.porta, b.banco, b.usuario, b.ssl, b.ativo, b.criado_em, b.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_banco_dados b
     JOIN empresas e ON e.id = b.empresa_id
     WHERE b.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, senha, ssl }) {
  const senhaEnc = encrypt(senha);
  const { rows } = await pool.query(
    `INSERT INTO integracoes_banco_dados (empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, senha_enc, ssl)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, ssl, ativo, criado_em, atualizado_em`,
    [empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, senhaEnc, Boolean(ssl)]
  );
  return rows[0];
}

async function update(id, { empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, senha, ssl }) {
  if (senha) {
    const senhaEnc = encrypt(senha);
    const { rows } = await pool.query(
      `UPDATE integracoes_banco_dados
       SET empresa_id = $1, nome_conexao = $2, sgbd = $3, host = $4, porta = $5, banco = $6, usuario = $7, senha_enc = $8, ssl = $9
       WHERE id = $10
       RETURNING id, empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, ssl, ativo, criado_em, atualizado_em`,
      [empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, senhaEnc, Boolean(ssl), id]
    );
    return rows[0] || null;
  }

  const { rows } = await pool.query(
    `UPDATE integracoes_banco_dados
     SET empresa_id = $1, nome_conexao = $2, sgbd = $3, host = $4, porta = $5, banco = $6, usuario = $7, ssl = $8
     WHERE id = $9
     RETURNING id, empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, ssl, ativo, criado_em, atualizado_em`,
    [empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, Boolean(ssl), id]
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_banco_dados SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, nome_conexao, sgbd, host, porta, banco, usuario, ssl, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

// Só pra uso interno do teste de conexão — nunca exposto pela API pro
// frontend (que só vê os campos de listagem/edição via getById, sem a
// senha). Mesmo padrão de email.service.js::getCredenciais.
async function getCredenciais(id) {
  const { rows } = await pool.query(
    'SELECT sgbd, host, porta, banco, usuario, senha_enc, ssl FROM integracoes_banco_dados WHERE id = $1',
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, senha: decrypt(row.senha_enc) };
}

// Traduz os erros mais comuns do driver `pg`/rede pra uma mensagem que faz
// sentido pra quem está cadastrando a conexão — mesmo espírito de
// email.service.js::traduzirErroSmtp.
function traduzirErroPostgres(err) {
  if (err.code === '28P01' || err.code === '28000') return 'Usuário ou senha incorretos.';
  if (err.code === '3D000') return 'Banco de dados não encontrado — confira o nome informado.';
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') return 'Host não encontrado — confira o endereço digitado.';
  if (err.code === 'ECONNREFUSED') return 'Não foi possível conectar ao servidor — confira o host e a porta.';
  if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
    return 'A conexão expirou (timeout) — confira o host, a porta e o firewall.';
  }
  return err.message || 'Não foi possível conectar ao banco de dados.';
}

// Conecta de verdade (fora do pool da própria aplicação — é um servidor de
// banco de dados escolhido pelo usuário, não o nosso) e roda um SELECT 1
// só pra confirmar que autentica, sem mexer em nada. Sempre fecha a
// conexão de teste, dê certo ou não.
async function testarConexaoPostgres({ host, porta, banco, usuario, senha, ssl }) {
  const client = new Client({
    host,
    port: porta,
    database: banco,
    user: usuario,
    password: senha,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch (err) {
    throw badRequest(traduzirErroPostgres(err));
  } finally {
    await client.end().catch(() => {});
  }
}

// Testa a conexão sem gravar nada — pensado pra rodar ANTES de salvar
// (formulário de Integrações > Banco de Dados), por isso recebe os campos
// crus em vez de um id — quando a senha vier em branco (editando sem
// trocar), busca a senha já salva pelo `id` informado, mesmo espírito de
// "editar sem repreencher mantém a senha atual" usado no `update`.
async function testarConexao({ id, sgbd, host, porta, banco, usuario, senha, ssl }) {
  let senhaFinal = senha;
  if (!senhaFinal) {
    if (!id) throw badRequest('Informe a senha para testar a conexão.');
    const credenciaisAtuais = await getCredenciais(id);
    if (!credenciaisAtuais) throw badRequest('Conexão não encontrada.');
    senhaFinal = credenciaisAtuais.senha;
  }

  if (sgbd === 'postgres') {
    await testarConexaoPostgres({ host, porta, banco, usuario, senha: senhaFinal, ssl });
    return { ok: true };
  }
  throw badRequest('SGBD ainda não suportado.');
}

// Busca as credenciais decifradas de uma conexão pelo nome (em vez do id) — pra módulos que
// consultam um banco de terceiro conhecido por nome (ex.: relatorioMasa.service.js buscando o
// "Time Tracker" da Masa), o mesmo espírito de actioonService.getCredenciaisAtivas.
async function getCredenciaisPorConexao(empresaId, nomeConexao) {
  const { rows } = await pool.query(
    `SELECT sgbd, host, porta, banco, usuario, senha_enc, ssl FROM integracoes_banco_dados
     WHERE empresa_id = $1 AND nome_conexao = $2 AND ativo = true LIMIT 1`,
    [empresaId, nomeConexao]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, senha: decrypt(row.senha_enc) };
}

module.exports = { list, getById, create, update, setAtivo, testarConexao, getCredenciaisPorConexao };
