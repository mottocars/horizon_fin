const pool = require('../../config/db');
const T = require('../../config/telas');

// Cadastros > Matriz de Alçadas (database/migrations/2026-11-19-matriz-alcadas.sql): por empresa e
// classificação, o usuário de cada item. Por enquanto: DRE › Aprovador — quem aprova a versão salva da DRE
// (só depois da aprovação ela é a publicada; ver dre-versoes). Classificação ou item novo: acrescentar aqui
// (e quem usa o item consulta com `usuarioDo`).
const CLASSIFICACOES = [
  {
    id: 'DRE',
    rotulo: 'DRE',
    descricao: 'Operações › DRE Construtoras e o dashboard Demonstração do Resultado',
    // `tela`: quem pode ser escolhido precisa ter acesso a ela (o aprovador aprova na aba Versões da DRE).
    tela: T.DRE,
    itens: [{ id: 'APROVADOR', rotulo: 'Aprovador', descricao: 'Aprova a versão salva da DRE; só depois da aprovação ela é publicada nos dashboards, no MCP e na Reforma Tributária.' }],
  },
  {
    id: 'DFC',
    rotulo: 'DFC',
    descricao: 'Operações › DFC Construtoras e o dashboard Fluxo de Caixa',
    // O aprovador aprova na aba Versões da DFC (ver dfc-versoes).
    tela: T.DFC,
    itens: [
      {
        id: 'APROVADOR',
        rotulo: 'Aprovador',
        descricao: 'Aprova a versão salva da DFC; só depois da aprovação ela é publicada no dashboard Fluxo de Caixa, no MCP e no Impacto DFC da Reforma Tributária.',
      },
    ],
  },
];

const db = pool.base;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Usuários ativos que podem responder pelo item: acesso à empresa (Master ou vinculado) e à tela da classificação.
async function elegiveis(empresaId, tela) {
  const { rows } = await db.query(
    `SELECT u.id, u.nome, u.avatar_url
       FROM usuarios u
      WHERE u.ativo
        AND (u.permissao = 'MASTER'
             OR (EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $1)
                 AND $2 = ANY(COALESCE(u.telas_permitidas, '{}'))))
      ORDER BY u.nome`,
    [empresaId, tela]
  );
  return rows;
}

async function listar(empresaId) {
  const { rows } = await db.query(
    `SELECT m.classificacao, m.item, m.usuario_id, u.nome, u.avatar_url, m.atualizado_em, a.nome AS atualizado_por
       FROM matriz_alcadas m JOIN usuarios u ON u.id = m.usuario_id LEFT JOIN usuarios a ON a.id = m.atualizado_por
      WHERE m.empresa_id = $1`,
    [empresaId]
  );
  const classificacoes = [];
  for (const c of CLASSIFICACOES) {
    const usuarios = await elegiveis(empresaId, c.tela);
    classificacoes.push({
      id: c.id,
      rotulo: c.rotulo,
      descricao: c.descricao,
      usuarios,
      itens: c.itens.map((i) => {
        const r = rows.find((x) => x.classificacao === c.id && x.item === i.id);
        return {
          id: i.id,
          rotulo: i.rotulo,
          descricao: i.descricao,
          usuario: r ? { id: r.usuario_id, nome: r.nome, avatar_url: r.avatar_url } : null,
          atualizado_em: r?.atualizado_em || null,
          atualizado_por: r?.atualizado_por || null,
        };
      }),
    });
  }
  return { classificacoes };
}

// Grava (ou limpa, com usuarioId null) o usuário de um item.
async function salvar(empresaId, classificacao, item, usuarioId, quemAlterou) {
  const c = CLASSIFICACOES.find((x) => x.id === classificacao);
  if (!c || !c.itens.some((i) => i.id === item)) throw erro(400, 'Classificação ou item inválido.');
  if (usuarioId === null) {
    await db.query('DELETE FROM matriz_alcadas WHERE empresa_id = $1 AND classificacao = $2 AND item = $3', [empresaId, classificacao, item]);
    return listar(empresaId);
  }
  if (!(await elegiveis(empresaId, c.tela)).some((u) => u.id === usuarioId)) {
    throw erro(400, 'Esse usuário não tem acesso a esta empresa e à tela da classificação.');
  }
  await db.query(
    `INSERT INTO matriz_alcadas (empresa_id, classificacao, item, usuario_id, atualizado_por, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (empresa_id, classificacao, item)
     DO UPDATE SET usuario_id = EXCLUDED.usuario_id, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em`,
    [empresaId, classificacao, item, usuarioId, quemAlterou, new Date()]
  );
  return listar(empresaId);
}

// O usuário de um item ({ id, nome } ou null) — ex.: usuarioDo(2, 'DRE', 'APROVADOR').
async function usuarioDo(empresaId, classificacao, item) {
  const { rows } = await db.query(
    `SELECT u.id, u.nome FROM matriz_alcadas m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.empresa_id = $1 AND m.classificacao = $2 AND m.item = $3`,
    [empresaId, classificacao, item]
  );
  return rows[0] || null;
}

module.exports = { CLASSIFICACOES, listar, salvar, usuarioDo };
