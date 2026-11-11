const pool = require('../../config/db');
const T = require('../../config/telas');

// "Usuário Administrador" da Gestão de Cobranças (aba Configurações), por empresa:
//   Administrador = Master, ou usuário marcado aqui (à direita na lista) — vê e altera todas as abas
//                   (Motor de Risco, Comunicação, Régua de Cobrança, Clientes, Configurações) e a Rotina
//                   de todos os atendentes;
//   Comum         = o resto de quem tem a tela — só Rotinas (a própria), Gestão das Parcelas e Clusters
//                   de Clientes.
// O frontend esconde as abas (GestaoCobrancasPage.jsx, via GET /cobranca-acesso/meu-acesso) e o backend
// barra as mesmas operações (exigirAdministradorCobranca nas rotas). Sem ninguém marcado, só o Master
// administra.

function erro(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

async function ehAdministradorCobranca(user, empresaId) {
  if (!user) return false;
  if (user.permissao === 'MASTER') return true;
  if (!empresaId) return false;
  const { rowCount } = await pool.query('SELECT 1 FROM cobranca_administradores WHERE empresa_id = $1 AND usuario_id = $2', [
    empresaId,
    user.id,
  ]);
  return rowCount > 0;
}

// Quem pode estar na lista: usuário ativo, não Master, com esta empresa no cadastro e a tela Gestão de
// Cobranças liberada. Os já marcados que deixaram de ser elegíveis continuam aparecendo (pra poder tirar).
async function getAdministradores(empresaId) {
  const [{ rows: elegiveis }, { rows: marcados }] = await Promise.all([
    pool.query(
      `SELECT u.id, u.nome, u.username FROM usuarios u
         JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
        WHERE u.ativo AND u.permissao <> 'MASTER' AND $2 = ANY(u.telas_permitidas)
        ORDER BY u.nome`,
      [empresaId, T.COBRANCAS]
    ),
    pool.query(
      `SELECT u.id, u.nome, u.username FROM cobranca_administradores a JOIN usuarios u ON u.id = a.usuario_id
        WHERE a.empresa_id = $1 ORDER BY u.nome`,
      [empresaId]
    ),
  ]);
  const porId = new Map(elegiveis.map((u) => [u.id, u]));
  for (const u of marcados) if (!porId.has(u.id)) porId.set(u.id, { ...u, inelegivel: true });
  return {
    usuarios: [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    selecionados: marcados.map((u) => u.id),
  };
}

// Grava a lista inteira (a tela manda o lado direito completo a cada movimento). Quem não é Master não
// pode se tirar da lista — senão perderia o acesso a esta mesma aba no meio da edição.
async function salvarAdministradores(empresaId, usuarioIds, autor) {
  const ids = [...new Set(usuarioIds.map(Number))];
  if (autor.permissao !== 'MASTER' && !ids.includes(Number(autor.id))) {
    throw erro(400, 'Você não pode tirar a si mesmo de Administrador — peça a outro administrador ou a um Master.');
  }
  const { usuarios, selecionados } = await getAdministradores(empresaId);
  const permitidos = new Set(usuarios.filter((u) => !u.inelegivel).map((u) => u.id));
  const atuais = new Set(selecionados);
  const invalido = ids.find((id) => !permitidos.has(id) && !atuais.has(id));
  if (invalido) throw erro(400, 'Só usuários ativos, com esta empresa e a tela Gestão de Cobranças no cadastro, podem ser Administrador.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cobranca_administradores WHERE empresa_id = $1 AND NOT (usuario_id = ANY($2::int[]))', [empresaId, ids]);
    if (ids.length) {
      await client.query(
        `INSERT INTO cobranca_administradores (empresa_id, usuario_id, criado_por)
         SELECT $1, x, $3 FROM UNNEST($2::int[]) AS x ON CONFLICT DO NOTHING`,
        [empresaId, ids, autor.id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getAdministradores(empresaId);
}

// Middleware das partes restritas ao Administrador. A empresa vem de `empresa_id` (query ou corpo) ou,
// nas rotas por id (etapa, template), do próprio registro (`sqlRecurso`, com o id em $1).
function exigirAdministradorCobranca(sqlRecurso) {
  return async (req, res, next) => {
    try {
      if (req.user?.permissao === 'MASTER') return next();
      let empresaId = Number(req.query?.empresa_id ?? req.body?.empresa_id) || null;
      if (!empresaId && sqlRecurso && req.params?.id) {
        const { rows } = await pool.query(sqlRecurso, [req.params.id]).catch(() => ({ rows: [] }));
        empresaId = rows[0]?.empresa_id ?? null;
      }
      if (!empresaId) return res.status(400).json({ message: 'Selecione uma empresa.' });
      if (await ehAdministradorCobranca(req.user, empresaId)) return next();
      return res.status(403).json({ message: 'Só o Usuário Administrador da Gestão de Cobranças pode fazer isso.' });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ehAdministradorCobranca, getAdministradores, salvarAdministradores, exigirAdministradorCobranca };
