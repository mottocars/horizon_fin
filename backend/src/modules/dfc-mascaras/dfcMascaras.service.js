const pool = require('../../config/db');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Tipo de detalhamento (só nível 2 — ver database/migrations/2026-11-25-dfc-mascaras-tipo-parcela.sql):
// PLANO_CONTAS (padrão) ou TIPO_PARCELA, com a conta do plano de contas que a máscara assume e as origens
// que a compõem.
const COLUNAS = 'id, parent_id, ordem, descricao, tipo_detalhamento, parcela_conta_sienge_id, parcela_origens';
const TIPOS_DETALHAMENTO = ['PLANO_CONTAS', 'TIPO_PARCELA'];
const ORIGENS_PARCELA = ['CEF_NOVO_REGISTRO', 'CEF_MEDICAO', 'SIENGE_AGING'];

// Devolve já em árvore: nível 1 na ordem, cada um com seus `filhos` (nível 2) na ordem.
async function list(empresaId, db = pool) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS} FROM dfc_mascaras
      WHERE empresa_id = $1
      ORDER BY ordem ASC, id ASC`,
    [empresaId]
  );
  const raizes = rows.filter((r) => r.parent_id === null).map((r) => ({ ...r, filhos: [] }));
  const porId = new Map(raizes.map((r) => [r.id, r]));
  rows.forEach((r) => {
    if (r.parent_id !== null) porId.get(r.parent_id)?.filhos.push(r);
  });
  return raizes;
}

// Cria no fim do grupo (ou no fim do nível 1, sem parentId). Só 2 níveis: o pai tem que ser
// de nível 1 e da mesma empresa.
async function create(empresaId, { parentId, descricoes }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (parentId !== null) {
      const { rows } = await client.query(
        'SELECT parent_id FROM dfc_mascaras WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
        [parentId, empresaId]
      );
      if (!rows[0]) throw erro(404, 'Máscara de nível 1 não encontrada.');
      if (rows[0].parent_id !== null) {
        throw erro(400, 'A DFC tem só 2 níveis: não dá pra criar dentro de um item de nível 2.');
      }
    }
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM dfc_mascaras
        WHERE empresa_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
      [empresaId, parentId]
    );
    const { rows } = await client.query(
      `INSERT INTO dfc_mascaras (empresa_id, parent_id, ordem, descricao)
       SELECT $1, $2, $3 + d.n, d.descricao
         FROM UNNEST($4::text[]) WITH ORDINALITY AS d(descricao, n)
       RETURNING ${COLUNAS}`,
      [empresaId, parentId, maxRows[0].max, descricoes]
    );
    await client.query('COMMIT');
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Campos parciais: `descricao` e, só no nível 2, `tipo_detalhamento`, `parcela_conta_sienge_id` e
// `parcela_origens`. Voltar para PLANO_CONTAS limpa a conta e as origens. A conta tem de ser analítica
// (tp_conta diferente de 'T') do plano de contas da empresa e não pode estar em outra máscara.
async function update(id, empresaId, campos) {
  const { rows: atual } = await pool.query(`SELECT ${COLUNAS} FROM dfc_mascaras WHERE id = $1 AND empresa_id = $2`, [
    id,
    empresaId,
  ]);
  if (!atual[0]) return null;
  const novo = { ...atual[0] };
  if (campos.descricao !== undefined) novo.descricao = campos.descricao;

  const mexeTipo = ['tipo_detalhamento', 'parcela_conta_sienge_id', 'parcela_origens'].some((c) => campos[c] !== undefined);
  if (mexeTipo) {
    if (atual[0].parent_id === null) throw erro(400, 'O tipo de detalhamento é só das máscaras de nível 2.');
    if (campos.tipo_detalhamento !== undefined) {
      if (!TIPOS_DETALHAMENTO.includes(campos.tipo_detalhamento)) throw erro(400, 'Tipo de detalhamento inválido.');
      novo.tipo_detalhamento = campos.tipo_detalhamento;
    }
    if (novo.tipo_detalhamento === 'PLANO_CONTAS') {
      if (campos.parcela_conta_sienge_id || campos.parcela_origens?.length) {
        throw erro(400, 'Conta e origens só valem no detalhamento por tipo de parcela.');
      }
      novo.parcela_conta_sienge_id = null;
      novo.parcela_origens = [];
    } else {
      if (campos.parcela_conta_sienge_id !== undefined) novo.parcela_conta_sienge_id = campos.parcela_conta_sienge_id;
      if (campos.parcela_origens !== undefined) {
        if (campos.parcela_origens.some((o) => !ORIGENS_PARCELA.includes(o))) throw erro(400, 'Origem inválida.');
        // Na ordem da lista (CEF - NOVO REGISTRO, CEF - MEDIÇÃO, SIENGE - AGING), sem repetir.
        novo.parcela_origens = ORIGENS_PARCELA.filter((o) => campos.parcela_origens.includes(o));
      }
    }
    if (novo.parcela_conta_sienge_id !== null && novo.parcela_conta_sienge_id !== atual[0].parcela_conta_sienge_id) {
      const { rows: conta } = await pool.query(
        'SELECT tp_conta FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = $2',
        [empresaId, novo.parcela_conta_sienge_id]
      );
      if (!conta[0]) throw erro(400, 'Conta não encontrada no plano de contas desta empresa.');
      if (conta[0].tp_conta === 'T') throw erro(400, 'Escolha uma conta analítica (último nível) do plano de contas.');
      const { rows: outra } = await pool.query(
        'SELECT descricao FROM dfc_mascaras WHERE empresa_id = $1 AND parcela_conta_sienge_id = $2 AND id <> $3',
        [empresaId, novo.parcela_conta_sienge_id, id]
      );
      if (outra[0]) throw erro(409, `Essa conta já está na máscara "${outra[0].descricao}".`);
    }
  }

  try {
    const { rows } = await pool.query(
      `UPDATE dfc_mascaras
          SET descricao = $3, tipo_detalhamento = $4, parcela_conta_sienge_id = $5, parcela_origens = $6
        WHERE id = $1 AND empresa_id = $2
       RETURNING ${COLUNAS}`,
      [id, empresaId, novo.descricao, novo.tipo_detalhamento, novo.parcela_conta_sienge_id, novo.parcela_origens]
    );
    return rows[0] || null;
  } catch (e) {
    // Corrida: outra gravação pôs a mesma conta em outra máscara.
    if (e.code === '23505') throw erro(409, 'Essa conta já está em outra máscara. Recarregue a tela.');
    throw e;
  }
}

// Remover um nível 1 leva junto os itens de nível 2 dele (ON DELETE CASCADE) — o front avisa
// isso na confirmação.
async function remove(id, empresaId) {
  const { rows } = await pool.query('DELETE FROM dfc_mascaras WHERE id = $1 AND empresa_id = $2 RETURNING id', [
    id,
    empresaId,
  ]);
  return !!rows[0];
}

// Regrava a árvore inteira (parent_id + ordem de todo mundo) de uma vez, a partir da estrutura
// final que o front montou depois do arrastar e soltar. Exige que a estrutura tenha exatamente
// os itens da empresa — se alguém criou/apagou algo noutra aba nesse meio-tempo, recusa em vez
// de adivinhar (o front recarrega).
async function reordenar(empresaId, estrutura) {
  const linhas = [];
  estrutura.forEach((raiz, i) => {
    linhas.push({ id: raiz.id, parentId: null, ordem: i + 1 });
    raiz.filhos.forEach((filhoId, j) => linhas.push({ id: filhoId, parentId: raiz.id, ordem: j + 1 }));
  });
  const ids = linhas.map((l) => l.id);
  if (new Set(ids).size !== ids.length) throw erro(400, 'Estrutura inválida: máscara repetida.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: atuais } = await client.query('SELECT id FROM dfc_mascaras WHERE empresa_id = $1 FOR UPDATE', [
      empresaId,
    ]);
    const atuaisIds = new Set(atuais.map((r) => r.id));
    if (atuaisIds.size !== ids.length || ids.some((id) => !atuaisIds.has(id))) {
      throw erro(409, 'As máscaras foram alteradas em outro lugar. Recarregue a tela e tente de novo.');
    }
    await client.query(
      `UPDATE dfc_mascaras m
          SET parent_id = v.parent_id, ordem = v.ordem
         FROM UNNEST($2::int[], $3::int[], $4::int[]) AS v(id, parent_id, ordem)
        WHERE m.id = v.id AND m.empresa_id = $1`,
      [empresaId, ids, linhas.map((l) => l.parentId), linhas.map((l) => l.ordem)]
    );
    // Item de nível 2 que virou nível 1 perde o tipo de detalhamento (só vale no nível 2).
    await client.query(
      `UPDATE dfc_mascaras
          SET tipo_detalhamento = 'PLANO_CONTAS', parcela_conta_sienge_id = NULL, parcela_origens = '{}'
        WHERE empresa_id = $1 AND parent_id IS NULL AND tipo_detalhamento <> 'PLANO_CONTAS'`,
      [empresaId]
    );
    const arvore = await list(empresaId, client);
    await client.query('COMMIT');
    return arvore;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, create, update, remove, reordenar, ORIGENS_PARCELA };
