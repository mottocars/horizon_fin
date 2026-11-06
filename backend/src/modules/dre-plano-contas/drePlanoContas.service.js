const pool = require('../../config/db');

// Operações > DRE Gerencial > Plano de Contas: mesmo esquema de dfc-plano-contas/dfcPlanoContas.service.js
// (plano Global + versões próprias por centro de custo): cada conta guarda a Máscara DRE (nível 2 de
// dre_mascaras) ou "NÃO ENTRA NA DRE" (nao_entra, sem máscara) e a Origem Projeção (de onde a aba
// Projeções tira os valores futuros — database/migrations/2026-11-05-dre-plano-contas-origem.sql).
// As duas são independentes; linha só existe pra conta com alguma delas — limpar as duas apaga.

// Origens Projeção da DRE (mesma lista do CHECK da migration e das opções da tela).
const ORIGENS_PROJECAO = ['NAO_POSSUI', 'HORIZON_ORCAMENTO_INFORMADO', 'SIENGE_ORCAMENTO_EMPRESARIAL', 'SIENGE_AGING'];

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Onde fica a classificação: plano Global (centroId null — dre_plano_contas, vale pra todos os
// centros) ou a versão própria de um centro de custo (dre_plano_contas_centro).
function alvo(centroId) {
  return centroId
    ? {
        tabela: 'dre_plano_contas_centro',
        filtro: (t = '') => `${t}empresa_id = $1 AND ${t}centro_id = $2`,
        chave: (empresaId) => [empresaId, centroId],
      }
    : { tabela: 'dre_plano_contas', filtro: (t = '') => `${t}empresa_id = $1`, chave: (empresaId) => [empresaId] };
}

async function exigirVersao(db, empresaId, centroId) {
  if (!centroId) return;
  const { rows } = await db.query('SELECT 1 FROM dre_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2', [
    empresaId,
    centroId,
  ]);
  if (!rows[0]) throw erro(404, 'Este centro de custo não tem versão própria do plano de contas.');
}

// Máscara DRE (ou nao_entra) e Origem Projeção das contas com alguma delas, no Global ou na versão do
// centro.
async function list(empresaId, centroId = null) {
  await exigirVersao(pool, empresaId, centroId);
  const a = alvo(centroId);
  const { rows } = await pool.query(
    `SELECT sienge_id, mascara_id, nao_entra, origem_projecao FROM ${a.tabela} WHERE ${a.filtro()}`,
    a.chave(empresaId)
  );
  return rows;
}

// Grava, no Global ou na versão do centro, o que vier em `patch` (o que não vier fica como está):
//   mascaraId / naoEntra — a Máscara DRE (só de nível 2 da mesma empresa), "NÃO ENTRA NA DRE" (naoEntra;
//                          a máscara é ignorada) ou limpa (mascaraId null sem naoEntra);
//   origem               — a Origem Projeção (ORIGENS_PROJECAO) ou null (limpa).
// Só conta analítica (tp_conta diferente de 'T'). Sem máscara, sem "não entra" e sem origem, a linha
// é apagada.
async function update(empresaId, siengeId, patch, { centroId = null } = {}) {
  const { rows: conta } = await pool.query(
    'SELECT tp_conta FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  if (!conta[0]) throw erro(404, 'Conta não encontrada no plano de contas desta empresa.');
  if (conta[0].tp_conta === 'T') throw erro(400, 'Conta totalizadora não recebe Máscara DRE nem Origem Projeção.');

  const mudaMascara = patch.mascaraId !== undefined || patch.naoEntra !== undefined;
  let mascaraId = patch.mascaraId ?? null;
  const naoEntra = Boolean(patch.naoEntra);
  if (patch.origem !== undefined && patch.origem !== null && !ORIGENS_PROJECAO.includes(patch.origem)) {
    throw erro(400, 'Origem Projeção inválida.');
  }
  if (naoEntra) mascaraId = null;
  else if (mudaMascara && mascaraId !== null) {
    const { rows: mascara } = await pool.query('SELECT parent_id FROM dre_mascaras WHERE id = $1 AND empresa_id = $2', [
      mascaraId,
      empresaId,
    ]);
    if (!mascara[0]) throw erro(400, 'Máscara DRE não encontrada nesta empresa.');
    if (mascara[0].parent_id === null) throw erro(400, 'Escolha uma máscara DRE de nível 2.');
  }

  const a = alvo(centroId);
  const base = a.chave(empresaId); // [$1] ou [$1, $2]
  const n = base.length;
  await exigirVersao(pool, empresaId, centroId);
  const { rows: atual } = await pool.query(
    `SELECT mascara_id, nao_entra, origem_projecao FROM ${a.tabela} WHERE ${a.filtro()} AND sienge_id = $${n + 1}`,
    [...base, siengeId]
  );
  const novo = {
    mascara_id: mudaMascara ? mascaraId : atual[0]?.mascara_id ?? null,
    nao_entra: mudaMascara ? naoEntra : atual[0]?.nao_entra ?? false,
    origem_projecao: patch.origem !== undefined ? patch.origem : atual[0]?.origem_projecao ?? null,
  };
  if (novo.mascara_id === null && !novo.nao_entra && novo.origem_projecao === null) {
    await pool.query(`DELETE FROM ${a.tabela} WHERE ${a.filtro()} AND sienge_id = $${n + 1}`, [...base, siengeId]);
    return { sienge_id: siengeId, ...novo };
  }
  const colunas = centroId ? 'empresa_id, centro_id, sienge_id' : 'empresa_id, sienge_id';
  const { rows } = await pool.query(
    `INSERT INTO ${a.tabela} (${colunas}, mascara_id, nao_entra, origem_projecao)
     VALUES (${[...base.map((_, i) => `$${i + 1}`), `$${n + 1}`, `$${n + 2}`, `$${n + 3}`, `$${n + 4}`].join(', ')})
     ON CONFLICT (${colunas}) DO UPDATE
       SET mascara_id = EXCLUDED.mascara_id, nao_entra = EXCLUDED.nao_entra, origem_projecao = EXCLUDED.origem_projecao
     RETURNING sienge_id, mascara_id, nao_entra, origem_projecao`,
    [...base, siengeId, novo.mascara_id, novo.nao_entra, novo.origem_projecao]
  );
  return rows[0];
}

// Centros que têm versão própria do plano — só os com "Realiza DRE" (aba Centros Custos): centro
// desmarcado some da tela (o plano dele fica guardado e volta se marcar de novo).
async function listVersoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT v.centro_id, c.name, v.criado_em, u.nome AS criado_por
       FROM dre_plano_contas_versoes v
       JOIN centros_custo_sienge c ON c.empresa_id = v.empresa_id AND c.sienge_id = v.centro_id
       LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.empresa_id = $1 AND c.realiza_dre
      ORDER BY c.name ASC`,
    [empresaId]
  );
  return rows;
}

// Cria a versão (plano próprio) do centro. `copiarDe`: 'global' = cópia do plano Global de agora;
// um id de centro = cópia do plano próprio daquele centro; 'branco' = sem nenhuma conta classificada.
async function criarVersao(empresaId, centroId, usuarioId, copiarDe = 'global') {
  const { rows: centro } = await pool.query(
    'SELECT name, realiza_dre FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, centroId]
  );
  if (!centro[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
  if (!centro[0].realiza_dre) {
    throw erro(400, `${centro[0].name} não está com "Realiza DRE" marcado na aba Centros Custos.`);
  }
  if (copiarDe !== 'global' && copiarDe !== 'branco') {
    const { rows: origem } = await pool.query(
      'SELECT 1 FROM dre_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2',
      [empresaId, copiarDe]
    );
    if (!origem[0]) throw erro(400, 'O plano escolhido pra copiar não existe mais.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query('INSERT INTO dre_plano_contas_versoes (empresa_id, centro_id, usuario_id) VALUES ($1, $2, $3)', [
        empresaId,
        centroId,
        usuarioId,
      ]);
    } catch (e) {
      if (e.code === '23505') throw erro(409, `${centro[0].name} já tem versão própria do plano de contas.`);
      throw e;
    }
    let rowCount = 0;
    if (copiarDe === 'global') {
      ({ rowCount } = await client.query(
        `INSERT INTO dre_plano_contas_centro (empresa_id, centro_id, sienge_id, mascara_id, nao_entra, origem_projecao)
         SELECT empresa_id, $2, sienge_id, mascara_id, nao_entra, origem_projecao FROM dre_plano_contas WHERE empresa_id = $1`,
        [empresaId, centroId]
      ));
    } else if (copiarDe !== 'branco') {
      ({ rowCount } = await client.query(
        `INSERT INTO dre_plano_contas_centro (empresa_id, centro_id, sienge_id, mascara_id, nao_entra, origem_projecao)
         SELECT empresa_id, $2, sienge_id, mascara_id, nao_entra, origem_projecao FROM dre_plano_contas_centro
          WHERE empresa_id = $1 AND centro_id = $3`,
        [empresaId, centroId, copiarDe]
      ));
    }
    await client.query('COMMIT');
    return { centro_id: centroId, name: centro[0].name, contas_copiadas: rowCount };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Exclui a versão do centro (as classificações dela vão junto, em cascata) — ele volta pro Global.
async function excluirVersao(empresaId, centroId) {
  const { rowCount } = await pool.query('DELETE FROM dre_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2', [
    empresaId,
    centroId,
  ]);
  if (!rowCount) throw erro(404, 'Este centro de custo não tem versão própria do plano de contas.');
  return { ok: true };
}

// Resumo pros cards da aba Plano de Contas: o Global e cada versão de centro, com quantas contas
// analíticas estão classificadas (Máscara DRE ou NÃO ENTRA NA DRE — a linha só com a Origem Projeção não
// conta) e quantas têm Origem Projeção (`com_origem`; NÃO POSSUI ORIGEM conta como informada). O Global diz também quantos
// centros com "Realiza DRE" seguem ele (os sem versão própria) — mesmo esquema do Projeta DFC na DFC.
async function resumo(empresaId) {
  const { rows: tot } = await pool.query(
    "SELECT count(*)::int AS analiticas FROM planos_financeiros_sienge WHERE empresa_id = $1 AND tp_conta <> 'T'",
    [empresaId]
  );
  const { rows: g } = await pool.query(
    // A linha pode existir só com a Origem Projeção: classificada = com máscara ou NÃO ENTRA NA DRE.
    `SELECT count(*) FILTER (WHERE mascara_id IS NOT NULL OR nao_entra)::int AS com_mascara,
            count(*) FILTER (WHERE origem_projecao IS NOT NULL)::int AS com_origem, MAX(atualizado_em) AS atualizado_em
       FROM dre_plano_contas WHERE empresa_id = $1`,
    [empresaId]
  );
  const { rows: seguem } = await pool.query(
    `SELECT count(*)::int AS n FROM centros_custo_sienge c
      WHERE c.empresa_id = $1 AND c.realiza_dre
        AND NOT EXISTS (SELECT 1 FROM dre_plano_contas_versoes v WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id)`,
    [empresaId]
  );
  const { rows: versoes } = await pool.query(
    `SELECT v.centro_id, c.name, c.natureza, v.criado_em, u.nome AS criado_por,
            count(d.sienge_id) FILTER (WHERE d.mascara_id IS NOT NULL OR d.nao_entra)::int AS com_mascara,
            count(d.sienge_id) FILTER (WHERE d.origem_projecao IS NOT NULL)::int AS com_origem,
            MAX(d.atualizado_em) AS atualizado_em
       FROM dre_plano_contas_versoes v
       JOIN centros_custo_sienge c ON c.empresa_id = v.empresa_id AND c.sienge_id = v.centro_id
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN dre_plano_contas_centro d ON d.empresa_id = v.empresa_id AND d.centro_id = v.centro_id
      WHERE v.empresa_id = $1 AND c.realiza_dre
      GROUP BY v.centro_id, c.name, c.natureza, v.criado_em, u.nome
      ORDER BY c.name ASC`,
    [empresaId]
  );
  return {
    analiticas: tot[0].analiticas,
    global: { ...g[0], centros_seguindo: seguem[0].n },
    versoes,
  };
}

// Quais naturezas entram na DRE em cada centro de custo, e com qual Máscara DRE: centro com "Realiza
// DRE" (aba Centros Custos) × conta com Máscara DRE no plano que vale pro centro — o plano próprio
// dele, se tiver (sem cair no Global), senão o Global. Conta sem máscara ou "NÃO ENTRA NA DRE" fica
// de fora. Subconsulta com as colunas centro_id (int), natureza_id (texto) e mascara_id; `p` = o
// parâmetro da empresa ('$1'). Usada pela DRE › Financeiro (listagem, cards, ajustes e lançamentos
// criados).
function sqlMapaDre(p = '$1') {
  return `
    SELECT c.sienge_id AS centro_id, pc.sienge_id::text AS natureza_id, pc.mascara_id
      FROM centros_custo_sienge c
      JOIN dre_plano_contas_versoes v ON v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id
      JOIN dre_plano_contas_centro pc ON pc.empresa_id = c.empresa_id AND pc.centro_id = c.sienge_id
     WHERE c.empresa_id = ${p} AND c.realiza_dre AND pc.mascara_id IS NOT NULL AND NOT pc.nao_entra
    UNION ALL
    SELECT c.sienge_id, pg.sienge_id::text, pg.mascara_id
      FROM centros_custo_sienge c
      JOIN dre_plano_contas pg ON pg.empresa_id = c.empresa_id
     WHERE c.empresa_id = ${p} AND c.realiza_dre AND pg.mascara_id IS NOT NULL AND NOT pg.nao_entra
       AND NOT EXISTS (SELECT 1 FROM dre_plano_contas_versoes v WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id)`;
}

// O plano que vale pra um centro (o próprio, se tiver, senão o Global), conta analítica a conta:
// [{ natureza_id (texto), nome, mascara_id, nao_entra, origem_projecao }] — conta sem linha vem com tudo
// nulo. Usado pela Projeção da DRE (dre-projecoes).
async function planoDoCentro(empresaId, centroId) {
  const { rows: v } = await pool.query('SELECT 1 FROM dre_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2', [
    empresaId,
    centroId,
  ]);
  const proprio = Boolean(v[0]);
  const { rows } = await pool.query(
    `SELECT p.sienge_id::text AS natureza_id, p.name AS nome, x.mascara_id, COALESCE(x.nao_entra, FALSE) AS nao_entra,
            x.origem_projecao
       FROM planos_financeiros_sienge p
       LEFT JOIN ${proprio ? 'dre_plano_contas_centro' : 'dre_plano_contas'} x
         ON x.empresa_id = p.empresa_id AND x.sienge_id = p.sienge_id ${proprio ? 'AND x.centro_id = $2' : ''}
      WHERE p.empresa_id = $1 AND p.tp_conta <> 'T'
      ORDER BY p.sienge_id::text`,
    proprio ? [empresaId, centroId] : [empresaId]
  );
  return { proprio, contas: rows };
}

module.exports = { list, update, listVersoes, criarVersao, excluirVersao, resumo, sqlMapaDre, planoDoCentro, ORIGENS_PROJECAO };
