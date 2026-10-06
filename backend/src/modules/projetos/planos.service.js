const pool = require('../../config/db');
const saldosService = require('../saldo-contas-bancarias/saldos.service');

// ---------------------------------------------------------------------------------------
// Home > Plano de Voo — aba "Plano de voo": planos com macro tarefas exibidos num Gantt.
//   - Plano: empresa, nome e as pessoas que podem enxergá-lo (além de quem criou).
//   - Macro tarefa: só o nome e a ordem. As datas saem dos cards ligados a ela.
//   - Micro tarefa = card do Kanban com macro_id. Quem enxerga o plano enxerga as micro
//     tarefas dele no Gantt (e pode abrir o card só para leitura).
//   - Só quem criou o plano edita (nome, pessoas, macros) e exclui.
// ---------------------------------------------------------------------------------------

// projetos.service também usa este módulo (visibilidade do card) — require tardio evita o ciclo.
const kanban = () => require('./projetos.service');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Plano visível para o usuário $n: criou ou foi incluído nas pessoas.
const VISIVEL = (alias, n) =>
  `(${alias}.criador_id = $${n} OR EXISTS (SELECT 1 FROM projetos_planos_membros pm WHERE pm.plano_id = ${alias}.id AND pm.usuario_id = $${n}))`;

async function podeVer(planoId, usuarioId) {
  const { rows } = await pool.query(`SELECT 1 FROM projetos_planos p WHERE p.id = $1 AND ${VISIVEL('p', 2)}`, [planoId, usuarioId]);
  return rows.length > 0;
}

const CAMPOS_PLANO = `p.id, p.empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_nome, e.logo AS empresa_logo,
  p.nome, p.criador_id, p.criado_em, p.atualizado_em,
  COALESCE((SELECT array_agg(pm.usuario_id ORDER BY pm.usuario_id) FROM projetos_planos_membros pm WHERE pm.plano_id = p.id), '{}') AS membros`;

async function carregarVisivel(id, usuarioId) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PLANO} FROM projetos_planos p JOIN empresas e ON e.id = p.empresa_id WHERE p.id = $1 AND ${VISIVEL('p', 2)}`,
    [id, usuarioId]
  );
  if (!rows[0]) throw erro(404, 'Plano de voo não encontrado.');
  return rows[0];
}

async function carregarDoCriador(id, usuarioId) {
  const plano = await carregarVisivel(id, usuarioId);
  if (plano.criador_id !== usuarioId) throw erro(403, 'Só quem criou o plano de voo pode alterá-lo.');
  return plano;
}

// Micro tarefas (cards) dos planos, com o bucket já calculado.
async function cardsDosPlanos(planoIds) {
  if (!planoIds.length) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.assunto, TO_CHAR(c.data_inicio, 'YYYY-MM-DD') AS data_inicio, TO_CHAR(c.data_fim, 'YYYY-MM-DD') AS data_fim,
            c.status, c.responsavel_id, c.criador_id, c.concluido_em, c.finalizado_em, c.macro_id, m.plano_id
     FROM projetos_cards c JOIN projetos_macros m ON m.id = c.macro_id
     WHERE m.plano_id = ANY($1::int[])
     ORDER BY c.data_inicio, c.data_fim, c.id`,
    [planoIds]
  );
  const { bucketDe, hoje } = kanban();
  const dataHoje = hoje();
  return rows.map((c) => ({ ...c, bucket: bucketDe(c, dataHoje) }));
}

function resumo(cards) {
  const porBucket = { AGUARDANDO: 0, PROGRESSO: 0, ATRASADO: 0, CONCLUIDO: 0, FINALIZADO: 0 };
  for (const c of cards) porBucket[c.bucket]++;
  const entregues = porBucket.CONCLUIDO + porBucket.FINALIZADO;
  return {
    total: cards.length,
    porBucket,
    progresso: cards.length ? Math.round((entregues / cards.length) * 100) : 0,
    inicio: cards.length ? cards.map((c) => c.data_inicio).sort()[0] : null,
    fim: cards.length ? cards.map((c) => c.data_fim).sort().at(-1) : null,
  };
}

async function listar(usuarioId, { empresaId } = {}) {
  const params = [usuarioId];
  let filtro = VISIVEL('p', 1);
  if (empresaId) {
    params.push(empresaId);
    filtro += ` AND p.empresa_id = $${params.length}`;
  }
  const { rows: planos } = await pool.query(
    `SELECT ${CAMPOS_PLANO},
            (SELECT COUNT(*)::int FROM projetos_macros m WHERE m.plano_id = p.id) AS macros
     FROM projetos_planos p JOIN empresas e ON e.id = p.empresa_id
     WHERE ${filtro}
     ORDER BY p.atualizado_em DESC, p.id DESC`,
    params
  );
  const cards = await cardsDosPlanos(planos.map((p) => p.id));
  const usuarios = await kanban().usuariosDe([...planos.flatMap((p) => [p.criador_id, ...p.membros]), ...cards.map((c) => c.responsavel_id)]);
  return {
    hoje: kanban().hoje(),
    planos: planos.map((p) => {
      const doPlano = cards.filter((c) => c.plano_id === p.id);
      return { ...p, ...resumo(doPlano), responsaveis: [...new Set(doPlano.map((c) => c.responsavel_id))] };
    }),
    usuarios,
  };
}

async function obter(id, usuarioId) {
  const plano = await carregarVisivel(id, usuarioId);
  const [{ rows: macros }, cards] = await Promise.all([
    pool.query('SELECT id, nome, ordem FROM projetos_macros WHERE plano_id = $1 ORDER BY ordem, id', [id]),
    cardsDosPlanos([id]),
  ]);
  const usuarios = await kanban().usuariosDe([plano.criador_id, ...plano.membros, ...cards.map((c) => c.responsavel_id)]);
  return {
    hoje: kanban().hoje(),
    plano: { ...plano, ...resumo(cards) },
    macros: macros.map((m) => ({ ...m, ...resumo(cards.filter((c) => c.macro_id === m.id)) })),
    cards,
    usuarios,
    permissoes: { editar: plano.criador_id === usuarioId },
  };
}

// Pessoas que podem enxergar: funcionários da empresa (mesma regra de quem pode ser responsável).
async function validarMembros(empresaId, membros, criadorId) {
  const elegiveis = new Set((await kanban().responsaveisElegiveis(empresaId)).map((u) => u.id));
  const invalido = membros.find((m) => !elegiveis.has(m));
  if (invalido) throw erro(400, 'Uma das pessoas escolhidas não tem acesso a esta empresa.');
  return [...new Set(membros)].filter((m) => m !== criadorId);
}

async function gravarMembros(client, planoId, membros) {
  await client.query('DELETE FROM projetos_planos_membros WHERE plano_id = $1', [planoId]);
  if (membros.length) {
    await client.query('INSERT INTO projetos_planos_membros (plano_id, usuario_id) SELECT $1, unnest($2::int[])', [planoId, membros]);
  }
}

async function emTransacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function criar(usuarioId, { empresa_id, nome, membros }) {
  await saldosService.assertAcessoEmpresa(usuarioId, empresa_id);
  const pessoas = await validarMembros(empresa_id, membros, usuarioId);
  const id = await emTransacao(async (client) => {
    const agora = new Date();
    const { rows } = await client.query(
      'INSERT INTO projetos_planos (empresa_id, nome, criador_id, criado_em, atualizado_em) VALUES ($1, $2, $3, $4, $4) RETURNING id',
      [empresa_id, nome, usuarioId, agora]
    );
    await gravarMembros(client, rows[0].id, pessoas);
    return rows[0].id;
  });
  return obter(id, usuarioId);
}

async function atualizar(id, usuarioId, { nome, membros }) {
  const plano = await carregarDoCriador(id, usuarioId);
  const pessoas = await validarMembros(plano.empresa_id, membros, usuarioId);
  await emTransacao(async (client) => {
    await client.query('UPDATE projetos_planos SET nome = $1, atualizado_em = $2 WHERE id = $3', [nome, new Date(), id]);
    await gravarMembros(client, id, pessoas);
  });
  return obter(id, usuarioId);
}

// Os cards continuam no Kanban — só deixam de estar ligados a uma macro (ON DELETE SET NULL).
async function excluir(id, usuarioId) {
  await carregarDoCriador(id, usuarioId);
  await pool.query('DELETE FROM projetos_planos WHERE id = $1', [id]);
}

const tocar = (id) => pool.query('UPDATE projetos_planos SET atualizado_em = $1 WHERE id = $2', [new Date(), id]);

async function criarMacro(id, usuarioId, nome) {
  await carregarDoCriador(id, usuarioId);
  await pool.query(
    `INSERT INTO projetos_macros (plano_id, nome, ordem, criado_em)
     VALUES ($1, $2, COALESCE((SELECT MAX(ordem) + 1 FROM projetos_macros WHERE plano_id = $1), 0), $3)`,
    [id, nome, new Date()]
  );
  await tocar(id);
  return obter(id, usuarioId);
}

async function macroDoPlano(id, macroId) {
  const { rows } = await pool.query('SELECT id FROM projetos_macros WHERE id = $1 AND plano_id = $2', [macroId, id]);
  if (!rows[0]) throw erro(404, 'Macro tarefa não encontrada.');
}

async function renomearMacro(id, macroId, usuarioId, nome) {
  await carregarDoCriador(id, usuarioId);
  await macroDoPlano(id, macroId);
  await pool.query('UPDATE projetos_macros SET nome = $1 WHERE id = $2', [nome, macroId]);
  await tocar(id);
  return obter(id, usuarioId);
}

async function excluirMacro(id, macroId, usuarioId) {
  await carregarDoCriador(id, usuarioId);
  await macroDoPlano(id, macroId);
  await pool.query('DELETE FROM projetos_macros WHERE id = $1', [macroId]);
  await tocar(id);
  return obter(id, usuarioId);
}

// `ids`: todas as macros do plano na ordem nova.
async function ordenarMacros(id, usuarioId, ids) {
  await carregarDoCriador(id, usuarioId);
  const { rows } = await pool.query('SELECT id FROM projetos_macros WHERE plano_id = $1', [id]);
  const atuais = new Set(rows.map((r) => r.id));
  if (ids.length !== atuais.size || ids.some((m) => !atuais.has(m))) throw erro(400, 'Lista de macro tarefas inválida.');
  await emTransacao(async (client) => {
    for (let i = 0; i < ids.length; i++) await client.query('UPDATE projetos_macros SET ordem = $1 WHERE id = $2', [i, ids[i]]);
  });
  await tocar(id);
  return obter(id, usuarioId);
}

// Para o formulário do card: planos que o usuário enxerga na empresa, com as macros.
async function opcoes(usuarioId, empresaId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.nome, m.id AS macro_id, m.nome AS macro_nome
     FROM projetos_planos p LEFT JOIN projetos_macros m ON m.plano_id = p.id
     WHERE p.empresa_id = $2 AND ${VISIVEL('p', 1)}
     ORDER BY p.nome, m.ordem, m.id`,
    [usuarioId, empresaId]
  );
  const planos = new Map();
  for (const r of rows) {
    if (!planos.has(r.id)) planos.set(r.id, { id: r.id, nome: r.nome, macros: [] });
    if (r.macro_id) planos.get(r.id).macros.push({ id: r.macro_id, nome: r.macro_nome });
  }
  return [...planos.values()];
}

// Card ligado a uma macro: a macro existe, o usuário enxerga o plano e o plano é da mesma empresa.
async function validarMacro(usuarioId, macroId, empresaId) {
  const { rows } = await pool.query(
    `SELECT p.empresa_id FROM projetos_macros m JOIN projetos_planos p ON p.id = m.plano_id
     WHERE m.id = $1 AND ${VISIVEL('p', 2)}`,
    [macroId, usuarioId]
  );
  if (!rows[0]) throw erro(400, 'Macro tarefa do plano de voo não encontrada.');
  if (rows[0].empresa_id !== empresaId) throw erro(400, 'O plano de voo escolhido é de outra empresa.');
}

module.exports = {
  podeVer,
  listar,
  obter,
  criar,
  atualizar,
  excluir,
  criarMacro,
  renomearMacro,
  excluirMacro,
  ordenarMacros,
  opcoes,
  validarMacro,
};
