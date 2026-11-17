const pool = require('../../config/db');

// Cadastros › Novidades (pedido do usuário, 17/11): cada recurso novo do
// sistema vira uma novidade com nome, descrição, GIF explicativo e público.
// Quem está no público vê a novidade numa janela ao entrar (uma vez — fica
// marcada como vista quando aparece) e sempre pelo botão "Novidades" do topo.
//   TODOS    → todos os usuários do sistema (só Master pode escolher — senão
//              alguém com a tela publicaria para clientes de outras empresas);
//   EMPRESAS → por empresa: todos os usuários dela ou só os escolhidos.
// Master vê todas.

function erro(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

const ehMaster = (user) => user?.permissao === 'MASTER';

// Condição SQL "a novidade n é visível para o usuário $1 (não Master)".
const VISIVEL_PARA_USUARIO = `(
  n.publico = 'TODOS'
  OR EXISTS (
    SELECT 1 FROM novidades_empresas ne
    WHERE ne.novidade_id = n.id AND (
      (ne.todos_usuarios AND EXISTS (
        SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = $1 AND ue.empresa_id = ne.empresa_id))
      OR EXISTS (
        SELECT 1 FROM novidades_usuarios nu
        WHERE nu.novidade_id = n.id AND nu.empresa_id = ne.empresa_id AND nu.usuario_id = $1)
    )
  )
)`;

// Mesma regra, pra contar o público (u = usuário candidato).
const VISIVEL_PARA_U = VISIVEL_PARA_USUARIO.replace(/\$1/g, 'u.id');

const CAMPOS_LISTA = `n.id, n.nome, n.descricao, n.publico, n.criado_em, n.atualizado_em,
  n.midia IS NOT NULL AS tem_midia, n.midia_tipo, n.midia_nome, n.midia_tamanho`;

// ─── para quem vê (qualquer usuário logado) ────────────────────────────────

async function minhasNovidades(user) {
  const master = ehMaster(user);
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_LISTA}, (v.usuario_id IS NOT NULL) AS vista
     FROM novidades n
     LEFT JOIN novidades_vistas v ON v.novidade_id = n.id AND v.usuario_id = $1
     WHERE ${master ? 'TRUE' : VISIVEL_PARA_USUARIO}
     ORDER BY n.criado_em DESC, n.id DESC`,
    [user.id]
  );
  return rows;
}

async function podeVer(user, novidadeId) {
  if (ehMaster(user)) return true;
  const { rowCount } = await pool.query(`SELECT 1 FROM novidades n WHERE n.id = $2 AND ${VISIVEL_PARA_USUARIO}`, [
    user.id,
    novidadeId,
  ]);
  return rowCount > 0;
}

async function marcarVista(user, novidadeId) {
  if (!(await podeVer(user, novidadeId))) throw erro(404, 'Novidade não encontrada.');
  await pool.query(
    `INSERT INTO novidades_vistas (novidade_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [novidadeId, user.id]
  );
}

async function midia(novidadeId) {
  const { rows } = await pool.query('SELECT midia, midia_tipo, atualizado_em FROM novidades WHERE id = $1', [novidadeId]);
  return rows[0]?.midia ? rows[0] : null;
}

async function midiaParaUsuario(user, novidadeId) {
  if (!(await podeVer(user, novidadeId))) return null;
  return midia(novidadeId);
}

// ─── cadastro (tela Cadastros › Novidades) ─────────────────────────────────

// Empresas que o usuário do cadastro pode usar no público (Master: todas).
function empresasPermitidas(user) {
  return ehMaster(user) ? null : user.empresaIds;
}

async function listar(user) {
  const permitidas = empresasPermitidas(user);
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_LISTA},
       (SELECT COUNT(*)::int FROM novidades_vistas v WHERE v.novidade_id = n.id) AS vistas,
       (SELECT COUNT(*)::int FROM usuarios u WHERE u.ativo AND (u.permissao = 'MASTER' OR ${VISIVEL_PARA_U})) AS publico_total,
       COALESCE((
         SELECT json_agg(json_build_object(
                  'empresa_id', ne.empresa_id,
                  'nome', COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), e.razao_social),
                  'todos_usuarios', ne.todos_usuarios,
                  'usuarios', (SELECT COUNT(*)::int FROM novidades_usuarios nu WHERE nu.novidade_id = n.id AND nu.empresa_id = ne.empresa_id))
                ORDER BY COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), e.razao_social))
         FROM novidades_empresas ne JOIN empresas e ON e.id = ne.empresa_id
         WHERE ne.novidade_id = n.id), '[]') AS empresas
     FROM novidades n
     ${
       // Quem não é Master só vê no cadastro as novidades inteiramente dentro das empresas dele
       // (a mesma regra de garantirAcessoCadastro, pra não listar o que não pode abrir).
       permitidas
         ? `WHERE n.publico = 'EMPRESAS'
              AND NOT EXISTS (SELECT 1 FROM novidades_empresas ne WHERE ne.novidade_id = n.id AND NOT (ne.empresa_id = ANY($1::int[])))`
         : ''
     }
     ORDER BY n.criado_em DESC, n.id DESC`,
    permitidas ? [[...permitidas]] : []
  );
  return rows;
}

async function garantirAcessoCadastro(user, novidadeId) {
  const { rows } = await pool.query('SELECT id, publico, criado_por FROM novidades WHERE id = $1', [novidadeId]);
  const n = rows[0];
  if (!n) throw erro(404, 'Novidade não encontrada.');
  if (ehMaster(user)) return n;
  if (n.publico === 'TODOS') throw erro(403, 'Só o Master pode alterar uma novidade para todos os usuários do sistema.');
  const { rows: fora } = await pool.query(
    'SELECT 1 FROM novidades_empresas WHERE novidade_id = $1 AND NOT (empresa_id = ANY($2::int[])) LIMIT 1',
    [novidadeId, [...user.empresaIds]]
  );
  if (fora.length) throw erro(403, 'Esta novidade inclui empresas que você não acessa.');
  return n;
}

async function obter(user, novidadeId) {
  await garantirAcessoCadastro(user, novidadeId);
  const { rows } = await pool.query(`SELECT ${CAMPOS_LISTA} FROM novidades n WHERE n.id = $1`, [novidadeId]);
  const { rows: empresas } = await pool.query(
    `SELECT ne.empresa_id, COALESCE(NULLIF(TRIM(e.nome_fantasia), ''), e.razao_social) AS nome, ne.todos_usuarios,
            COALESCE(array_agg(nu.usuario_id ORDER BY nu.usuario_id) FILTER (WHERE nu.usuario_id IS NOT NULL), '{}') AS usuario_ids
     FROM novidades_empresas ne
     JOIN empresas e ON e.id = ne.empresa_id
     LEFT JOIN novidades_usuarios nu ON nu.novidade_id = ne.novidade_id AND nu.empresa_id = ne.empresa_id
     WHERE ne.novidade_id = $1
     GROUP BY ne.empresa_id, e.nome_fantasia, e.razao_social, ne.todos_usuarios
     ORDER BY 2`,
    [novidadeId]
  );
  return { ...rows[0], empresas };
}

// dados = { nome, descricao, publico, empresas: [{ empresa_id, todos_usuarios, usuario_ids }] }
// arquivo = { buffer, mimetype, originalname, size } | undefined (mantém o GIF atual)
async function validarPublico(user, dados) {
  if (dados.publico === 'TODOS') {
    if (!ehMaster(user)) throw erro(403, 'Só o Master pode mostrar uma novidade para todos os usuários do sistema.');
    return;
  }
  if (!dados.empresas.length) throw erro(400, 'Escolha pelo menos uma empresa.');
  const permitidas = empresasPermitidas(user);
  for (const e of dados.empresas) {
    if (permitidas && !permitidas.has(Number(e.empresa_id))) throw erro(403, 'Você não acessa uma das empresas escolhidas.');
    if (!e.todos_usuarios && !e.usuario_ids.length) {
      throw erro(400, 'Em cada empresa, marque "Todos os usuários" ou escolha pelo menos um usuário.');
    }
  }
  // Os usuários escolhidos precisam ser daquela empresa (ou Master).
  for (const e of dados.empresas.filter((x) => !x.todos_usuarios)) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM usuarios u
       WHERE u.id = ANY($2::int[]) AND u.ativo
         AND (u.permissao = 'MASTER' OR EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $1))`,
      [e.empresa_id, e.usuario_ids]
    );
    if (rows[0].n !== new Set(e.usuario_ids).size) throw erro(400, 'Um dos usuários escolhidos não é desta empresa.');
  }
}

async function gravarPublico(db, novidadeId, dados) {
  await db.query('DELETE FROM novidades_empresas WHERE novidade_id = $1', [novidadeId]);
  if (dados.publico !== 'EMPRESAS') return;
  for (const e of dados.empresas) {
    await db.query('INSERT INTO novidades_empresas (novidade_id, empresa_id, todos_usuarios) VALUES ($1, $2, $3)', [
      novidadeId,
      e.empresa_id,
      e.todos_usuarios,
    ]);
    if (!e.todos_usuarios) {
      await db.query(
        `INSERT INTO novidades_usuarios (novidade_id, empresa_id, usuario_id)
         SELECT $1, $2, x FROM unnest($3::int[]) AS x ON CONFLICT DO NOTHING`,
        [novidadeId, e.empresa_id, [...new Set(e.usuario_ids)]]
      );
    }
  }
}

async function salvar(user, novidadeId, dados, arquivo) {
  if (novidadeId) await garantirAcessoCadastro(user, novidadeId);
  await validarPublico(user, dados);
  if (!novidadeId && !arquivo) throw erro(400, 'Envie o GIF explicativo.');

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    let id = novidadeId;
    if (id) {
      await db.query(
        `UPDATE novidades SET nome = $2, descricao = $3, publico = $4, atualizado_em = NOW() WHERE id = $1`,
        [id, dados.nome, dados.descricao, dados.publico]
      );
    } else {
      const { rows } = await db.query(
        `INSERT INTO novidades (nome, descricao, publico, criado_por) VALUES ($1, $2, $3, $4) RETURNING id`,
        [dados.nome, dados.descricao, dados.publico, user.id]
      );
      id = rows[0].id;
    }
    if (arquivo) {
      await db.query(
        `UPDATE novidades SET midia = $2, midia_tipo = $3, midia_nome = $4, midia_tamanho = $5, atualizado_em = NOW() WHERE id = $1`,
        [id, arquivo.buffer, arquivo.mimetype, arquivo.originalname, arquivo.size]
      );
    }
    await gravarPublico(db, id, dados);
    await db.query('COMMIT');
    return obter(user, id);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

async function excluir(user, novidadeId) {
  await garantirAcessoCadastro(user, novidadeId);
  await pool.query('DELETE FROM novidades WHERE id = $1', [novidadeId]);
}

async function midiaCadastro(user, novidadeId) {
  await garantirAcessoCadastro(user, novidadeId);
  return midia(novidadeId);
}

// Opções do público: empresas ativas que o usuário acessa e os usuários de
// uma empresa (mesma regra de Formulários: ativos, da empresa ou Master).
async function opcoesEmpresas(user) {
  const permitidas = empresasPermitidas(user);
  const { rows } = await pool.query(
    `SELECT id, COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) AS nome FROM empresas
     WHERE ativo ${permitidas ? 'AND id = ANY($1::int[])' : ''} ORDER BY 2`,
    permitidas ? [[...permitidas]] : []
  );
  return rows;
}

async function opcoesUsuarios(user, empresaId) {
  const permitidas = empresasPermitidas(user);
  if (permitidas && !permitidas.has(Number(empresaId))) throw erro(403, 'Você não acessa esta empresa.');
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.permissao FROM usuarios u
     WHERE u.ativo AND (u.permissao = 'MASTER' OR EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $1))
     ORDER BY u.nome`,
    [empresaId]
  );
  return rows;
}

module.exports = {
  minhasNovidades,
  marcarVista,
  midiaParaUsuario,
  listar,
  obter,
  salvar,
  excluir,
  midiaCadastro,
  opcoesEmpresas,
  opcoesUsuarios,
};
