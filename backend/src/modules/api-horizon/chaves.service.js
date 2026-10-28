const pool = require('../../config/db');
const {
  PREFIXO_CHAVE,
  MAX_CHAVES_ATIVAS_POR_USUARIO,
  gerarSegredo,
  hashSegredo,
  usuarioPodeUsarApi,
  SQL_USUARIO,
} = require('./comum');

// Chaves da API Horizon (tela Integrações > API Horizon). Cada chave é de um usuário e de uma
// empresa: a API age com as permissões desse usuário (precisa da tela Espião NFe/NFSe) e só
// enxerga essa empresa. A chave aparece uma única vez, na criação.

function erro(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

const SITUACAO = `CASE
  WHEN k.revogada_em IS NOT NULL THEN 'revogada'
  WHEN k.expira_em <= NOW() THEN 'expirada'
  ELSE 'ativa' END`;

const SELECT_CHAVE = `
  SELECT k.id, k.nome, k.prefixo, k.pode_inativar, k.expira_em, k.ultimo_uso_em, k.revogada_em, k.criado_em,
         ${SITUACAO} AS situacao,
         k.usuario_id, u.nome AS usuario_nome,
         k.empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_nome, e.cnpj AS empresa_cnpj,
         ur.nome AS revogada_por_nome,
         (SELECT COUNT(*)::int FROM api_horizon_requisicoes r
           WHERE r.chave_id = k.id AND r.criado_em >= NOW() - INTERVAL '30 days') AS chamadas_30_dias
  FROM api_horizon_chaves k
  JOIN usuarios u ON u.id = k.usuario_id
  JOIN empresas e ON e.id = k.empresa_id
  LEFT JOIN usuarios ur ON ur.id = k.revogada_por`;

// Master vê as chaves de todos (pra poder revogar); os demais, só as próprias.
async function listar(user) {
  const params = [];
  let where = '';
  if (user.permissao !== 'MASTER') {
    params.push(user.id);
    where = 'WHERE k.usuario_id = $1';
  }
  const { rows } = await pool.query(
    `${SELECT_CHAVE} ${where} ORDER BY (k.revogada_em IS NULL AND k.expira_em > NOW()) DESC, k.criado_em DESC`,
    params
  );
  return rows;
}

async function buscar(id) {
  const { rows } = await pool.query(`${SELECT_CHAVE} WHERE k.id = $1`, [id]);
  return rows[0] || null;
}

async function criar(user, { nome, empresaId, validadeDias, podeInativar }) {
  const { rows: usuarios } = await pool.query(SQL_USUARIO, [user.id]);
  if (!usuarioPodeUsarApi(usuarios[0], empresaId)) {
    throw erro(403, 'Para gerar uma chave você precisa ter acesso à tela Espião NFe / NFSe e à empresa escolhida.');
  }

  const { rows: ativas } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM api_horizon_chaves
     WHERE usuario_id = $1 AND revogada_em IS NULL AND expira_em > NOW()`,
    [user.id]
  );
  if (ativas[0].total >= MAX_CHAVES_ATIVAS_POR_USUARIO) {
    throw erro(400, `Você já tem ${MAX_CHAVES_ATIVAS_POR_USUARIO} chaves ativas. Revogue uma antes de gerar outra.`);
  }

  const chave = gerarSegredo(PREFIXO_CHAVE);
  const { rows } = await pool.query(
    `INSERT INTO api_horizon_chaves (usuario_id, empresa_id, nome, prefixo, chave_hash, pode_inativar, expira_em)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(days => $7))
     RETURNING id`,
    [user.id, empresaId, nome, chave.slice(0, PREFIXO_CHAVE.length + 6), hashSegredo(chave), podeInativar, validadeDias]
  );
  return { chave, item: await buscar(rows[0].id) };
}

// Revogar corta na hora: apaga também os tokens temporários já emitidos com a chave.
async function revogar(user, id) {
  const atual = await buscar(id);
  if (!atual) throw erro(404, 'Chave não encontrada.');
  if (user.permissao !== 'MASTER' && atual.usuario_id !== user.id) throw erro(404, 'Chave não encontrada.');
  if (atual.revogada_em) return atual;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE api_horizon_chaves SET revogada_em = NOW(), revogada_por = $1 WHERE id = $2', [user.id, id]);
    await client.query('DELETE FROM api_horizon_tokens WHERE chave_id = $1', [id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return buscar(id);
}

// Últimas chamadas feitas com a chave (janela "Chamadas" da tela).
async function listarRequisicoes(user, id) {
  const atual = await buscar(id);
  if (!atual || (user.permissao !== 'MASTER' && atual.usuario_id !== user.id)) throw erro(404, 'Chave não encontrada.');
  const { rows } = await pool.query(
    `SELECT id, metodo, rota, consulta, status, ip, user_agent, duracao_ms, criado_em
     FROM api_horizon_requisicoes WHERE chave_id = $1 ORDER BY criado_em DESC LIMIT 100`,
    [id]
  );
  return rows;
}

module.exports = { listar, criar, revogar, listarRequisicoes };
