const pool = require('../../config/db');
const { PREFIXO_CHAVE, gerarSegredo, hashSegredo, usuarioPodeUsarApi, SQL_USUARIO } = require('./comum');
const { PORID, gruposDisponiveis } = require('./grupos');

// Chaves da API Horizon (tela Integrações > API Horizon). Cada usuário tem UMA chave em uso,
// presa a ele (a API age com as permissões dele) e a uma empresa (só enxerga os dados dela), com
// os grupos de endpoints que ele liberou — só os das telas que ele tem. Gerar outra substitui a
// anterior. A chave aparece uma única vez, na geração; aqui só fica o hash.

function erro(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

const SELECT_CHAVE = `
  SELECT k.id, k.prefixo, k.grupos, k.escopos, k.expira_em, k.ultimo_uso_em, k.revogada_em, k.criado_em,
         CASE WHEN k.revogada_em IS NOT NULL THEN 'revogada' WHEN k.expira_em <= NOW() THEN 'expirada' ELSE 'ativa' END AS situacao,
         k.usuario_id, u.nome AS usuario_nome,
         k.empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_nome,
         (SELECT COUNT(*)::int FROM api_horizon_requisicoes r
           WHERE r.chave_id = k.id AND r.criado_em >= NOW() - INTERVAL '30 days') AS chamadas_30_dias
  FROM api_horizon_chaves k
  JOIN usuarios u ON u.id = k.usuario_id
  JOIN empresas e ON e.id = k.empresa_id`;

// Nomes dos acessos pra tela (o banco guarda os ids: notas-fiscais, notas:inativar...).
function comNomes(chave) {
  if (!chave) return null;
  const escopos = new Map([...PORID.values()].flatMap((g) => g.escopos.map((e) => [e.id, e.titulo])));
  return {
    ...chave,
    grupos_titulos: chave.grupos.map((g) => PORID.get(g)?.titulo || g),
    escopos_titulos: chave.escopos.map((e) => escopos.get(e) || e),
  };
}

async function carregarUsuario(id) {
  const { rows } = await pool.query(SQL_USUARIO, [id]);
  return rows[0];
}

async function chaveEmUso(usuarioId) {
  const { rows } = await pool.query(`${SELECT_CHAVE} WHERE k.usuario_id = $1 AND k.revogada_em IS NULL`, [usuarioId]);
  return comNomes(rows[0] || null);
}

// O que a tela mostra pro usuário: os grupos que ele pode liberar e a chave dele (se tiver).
async function minha(user) {
  const usuario = await carregarUsuario(user.id);
  return {
    chave: await chaveEmUso(user.id),
    grupos: gruposDisponiveis(usuario).map(({ id, titulo, descricao, nomeTela, endpoints, escopos }) => ({
      id,
      titulo,
      descricao,
      nomeTela,
      endpoints,
      escopos,
    })),
  };
}

// Só grupos das telas que o usuário tem; escopos só dos grupos marcados.
function validarAcessos(usuario, grupos, escopos) {
  const disponiveis = new Set(gruposDisponiveis(usuario).map((g) => g.id));
  const lista = [...new Set(grupos)];
  if (!lista.length) throw erro(400, 'Escolha pelo menos um acesso para a chave.');
  const fora = lista.filter((g) => !disponiveis.has(g));
  if (fora.length) throw erro(403, 'Você não tem acesso a um dos itens escolhidos.');
  const permitidos = new Set(lista.flatMap((g) => PORID.get(g).escopos.map((e) => e.id)));
  const escopo = [...new Set(escopos)];
  if (escopo.some((e) => !permitidos.has(e))) throw erro(400, 'Permissão de escrita inválida para os acessos escolhidos.');
  return { grupos: lista, escopos: escopo };
}

// Gera a chave do usuário. Se ele já tinha uma, ela é revogada na mesma transação (e os tokens
// emitidos com ela deixam de valer).
async function gerar(user, { empresaId, validadeDias, grupos, escopos }) {
  const usuario = await carregarUsuario(user.id);
  if (!usuarioPodeUsarApi(usuario, empresaId)) throw erro(403, 'Você não tem acesso à empresa escolhida.');
  const acessos = validarAcessos(usuario, grupos, escopos);

  const chave = gerarSegredo(PREFIXO_CHAVE);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: antigas } = await client.query(
      'UPDATE api_horizon_chaves SET revogada_em = NOW(), revogada_por = $1 WHERE usuario_id = $1 AND revogada_em IS NULL RETURNING id',
      [user.id]
    );
    if (antigas.length) {
      await client.query('DELETE FROM api_horizon_tokens WHERE chave_id = ANY($1::int[])', [antigas.map((r) => r.id)]);
    }
    await client.query(
      `INSERT INTO api_horizon_chaves (usuario_id, empresa_id, prefixo, chave_hash, grupos, escopos, expira_em)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(days => $7))`,
      [user.id, empresaId, chave.slice(0, PREFIXO_CHAVE.length + 6), hashSegredo(chave), acessos.grupos, acessos.escopos, validadeDias]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { chave, item: await chaveEmUso(user.id) };
}

// Muda o que a chave em uso acessa, sem trocar a chave.
async function alterarAcessos(user, { grupos, escopos }) {
  const atual = await chaveEmUso(user.id);
  if (!atual) throw erro(404, 'Você ainda não tem uma chave.');
  const acessos = validarAcessos(await carregarUsuario(user.id), grupos, escopos);
  await pool.query('UPDATE api_horizon_chaves SET grupos = $1, escopos = $2 WHERE id = $3', [acessos.grupos, acessos.escopos, atual.id]);
  return chaveEmUso(user.id);
}

async function revogarPorId(id, revogadaPor) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE api_horizon_chaves SET revogada_em = NOW(), revogada_por = $1 WHERE id = $2 AND revogada_em IS NULL', [
      revogadaPor,
      id,
    ]);
    await client.query('DELETE FROM api_horizon_tokens WHERE chave_id = $1', [id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function revogarMinha(user) {
  const atual = await chaveEmUso(user.id);
  if (!atual) throw erro(404, 'Você não tem chave em uso.');
  await revogarPorId(atual.id, user.id);
}

const SELECT_REQUISICOES = `
  SELECT r.id, r.metodo, r.rota, r.consulta, r.status, r.ip, r.duracao_ms, r.criado_em, k.prefixo
  FROM api_horizon_requisicoes r
  JOIN api_horizon_chaves k ON k.id = r.chave_id`;

// Últimas chamadas feitas com as chaves do usuário (a atual e as anteriores).
async function minhasRequisicoes(user) {
  const { rows } = await pool.query(`${SELECT_REQUISICOES} WHERE k.usuario_id = $1 ORDER BY r.criado_em DESC LIMIT 100`, [user.id]);
  return rows;
}

// ---- Master: chaves de todos os usuários (pra acompanhar e revogar) ----

async function listarTodas() {
  const { rows } = await pool.query(`${SELECT_CHAVE} WHERE k.revogada_em IS NULL ORDER BY u.nome`);
  return rows.map(comNomes);
}

async function revogarDeUsuario(master, id) {
  const { rows } = await pool.query('SELECT id FROM api_horizon_chaves WHERE id = $1', [id]);
  if (!rows.length) throw erro(404, 'Chave não encontrada.');
  await revogarPorId(id, master.id);
}

async function requisicoesDaChave(id) {
  const { rows } = await pool.query(`${SELECT_REQUISICOES} WHERE r.chave_id = $1 ORDER BY r.criado_em DESC LIMIT 100`, [id]);
  return rows;
}

module.exports = {
  minha,
  gerar,
  alterarAcessos,
  revogarMinha,
  minhasRequisicoes,
  listarTodas,
  revogarDeUsuario,
  requisicoesDaChave,
};
