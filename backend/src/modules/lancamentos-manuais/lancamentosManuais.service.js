const pool = require('../../config/db');

// Lançamentos financeiros criados à mão (tabela lancamentos_manuais —
// database/migrations/2026-10-30-lancamentos-manuais.sql): não vêm do Sienge; entram nas listagens
// como movimento (origem 'M'), com o status "Criado". O log de cada criação, alteração e exclusão fica
// em lancamentos_ajustes_historico (origem 'M', chave = id). Genérico: hoje quem usa é a DRE
// Gerencial › Financeiro ("Novo lançamento").
// Data no ano atual ou depois não pode: é o exercício em andamento, travado, só visualização (pedido
// do usuário) — vale pra criar, alterar e excluir, aqui no backend.

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Exercício em andamento ou futuro (pelo relógio da aplicação — o do Postgres da VPS é deslocado).
const travadoPela = (data) => Boolean(data) && Number(String(data).slice(0, 4)) >= new Date().getFullYear();
const MSG_TRAVADO = 'Exercício em andamento: só pode ser visualizado, não aceita lançamento criado nem alterado.';

const CAMPOS = 'id, tipo, to_char(data, \'YYYY-MM-DD\') AS data, documento, historico, centro_id, natureza_id, valor, usuario_id, criado_em, atualizado_em';
const resumo = (l) =>
  l && { tipo: l.tipo, data: l.data, documento: l.documento || null, historico: l.historico, centro_id: l.centro_id, natureza_id: l.natureza_id, valor: Number(l.valor) };

async function opcoes(empresaId) {
  const [{ rows: centros }, { rows: naturezas }] = await Promise.all([
    pool.query('SELECT sienge_id AS id, name AS nome FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY sienge_id', [empresaId]),
    pool.query(
      "SELECT sienge_id::text AS id, name AS nome FROM planos_financeiros_sienge WHERE empresa_id = $1 AND tp_conta <> 'T' ORDER BY sienge_id::text",
      [empresaId]
    ),
  ]);
  return { centros, naturezas };
}

async function buscar(db, empresaId, id) {
  const { rows } = await db.query(`SELECT ${CAMPOS} FROM lancamentos_manuais WHERE empresa_id = $1 AND id = $2`, [empresaId, id]);
  return rows[0] || null;
}

// O lançamento, quem criou, o log (`log`) e as opções de centro e natureza.
async function obter(empresaId, id) {
  const l = await buscar(pool, empresaId, id);
  if (!l) throw erro(404, 'Lançamento não encontrado nesta empresa.');
  const [{ rows: usuario }, { rows: log }, op] = await Promise.all([
    pool.query('SELECT nome FROM usuarios WHERE id = $1', [l.usuario_id]),
    pool.query(
      `SELECT h.acao, h.antes, h.depois, h.criado_em, u.nome AS usuario
         FROM lancamentos_ajustes_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.empresa_id = $1 AND h.origem = 'M' AND h.chave = $2
        ORDER BY h.criado_em DESC, h.id DESC LIMIT 30`,
      [empresaId, id]
    ),
    opcoes(empresaId),
  ]);
  // `historico` é o texto do lançamento; o log de alterações vai em `log`.
  return { ...l, valor: Number(l.valor), usuario: usuario[0]?.nome || null, travado: travadoPela(l.data), log, opcoes: op };
}

async function validar(empresaId, dados) {
  if (travadoPela(dados.data)) throw erro(403, MSG_TRAVADO);
  const { rows: cc } = await pool.query('SELECT 1 FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, dados.centro_id]);
  if (!cc[0]) throw erro(400, 'Centro de custo não encontrado nesta empresa.');
  const { rows: nat } = await pool.query(
    "SELECT 1 FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id::text = $2 AND tp_conta <> 'T'",
    [empresaId, String(dados.natureza_id)]
  );
  if (!nat[0]) throw erro(400, 'Natureza não encontrada no plano de contas (só contas analíticas).');
}

async function registrar(db, empresaId, id, acao, antes, depois, usuarioId) {
  await db.query(
    `INSERT INTO lancamentos_ajustes_historico (empresa_id, origem, chave, acao, antes, depois, usuario_id)
     VALUES ($1, 'M', $2, $3, $4, $5, $6)`,
    [empresaId, id, acao, resumo(antes), resumo(depois), usuarioId]
  );
}

async function transacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// `dados`: { tipo: 'ENTRADA' | 'SAIDA', data 'AAAA-MM-DD', documento, historico, centro_id, natureza_id,
// valor (> 0) }.
async function criar(empresaId, dados, usuarioId) {
  await validar(empresaId, dados);
  const id = await transacao(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO lancamentos_manuais (empresa_id, tipo, data, documento, historico, centro_id, natureza_id, valor, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [empresaId, dados.tipo, dados.data, dados.documento || null, dados.historico, dados.centro_id, String(dados.natureza_id), dados.valor, usuarioId]
    );
    await registrar(db, empresaId, rows[0].id, 'CRIOU', null, await buscar(db, empresaId, rows[0].id), usuarioId);
    return rows[0].id;
  });
  return obter(empresaId, id);
}

async function alterar(empresaId, id, dados, usuarioId) {
  const atual = await buscar(pool, empresaId, id);
  if (!atual) throw erro(404, 'Lançamento não encontrado nesta empresa.');
  if (travadoPela(atual.data)) throw erro(403, MSG_TRAVADO);
  await validar(empresaId, dados);
  await transacao(async (db) => {
    await db.query(
      `UPDATE lancamentos_manuais SET tipo = $3, data = $4, documento = $5, historico = $6, centro_id = $7, natureza_id = $8, valor = $9
        WHERE empresa_id = $1 AND id = $2`,
      [empresaId, id, dados.tipo, dados.data, dados.documento || null, dados.historico, dados.centro_id, String(dados.natureza_id), dados.valor]
    );
    await registrar(db, empresaId, id, 'ALTEROU', atual, await buscar(db, empresaId, id), usuarioId);
  });
  return obter(empresaId, id);
}

async function excluir(empresaId, id, usuarioId) {
  const atual = await buscar(pool, empresaId, id);
  if (!atual) throw erro(404, 'Lançamento não encontrado nesta empresa.');
  if (travadoPela(atual.data)) throw erro(403, MSG_TRAVADO);
  await transacao(async (db) => {
    await db.query('DELETE FROM lancamentos_manuais WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    await registrar(db, empresaId, id, 'EXCLUIU', atual, null, usuarioId);
  });
  return { ok: true };
}

module.exports = { opcoes, obter, criar, alterar, excluir };
