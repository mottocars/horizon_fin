const pool = require('../../config/db');

// Operações > DRE Gerencial > Máscaras: espelho de dfc-mascaras/dfcMascaras.service.js (mesma
// árvore de 2 níveis, mesma tela), na tabela dre_mascaras — mais as marcações totalizadora (só
// nível 1) e realiza_poc (só nível 2; ver 2026-10-22-dre-mascaras-flags.sql). Totalizadora nunca
// tem nível 2 dentro: create, update e reordenar recusam o que quebraria isso.

const COLUNAS = 'id, parent_id, ordem, descricao, totalizadora, realiza_poc';

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Devolve já em árvore: nível 1 na ordem, cada um com seus `filhos` (nível 2) na ordem.
async function list(empresaId, db = pool) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS} FROM dre_mascaras
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
        'SELECT parent_id, totalizadora FROM dre_mascaras WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
        [parentId, empresaId]
      );
      if (!rows[0]) throw erro(404, 'Máscara de nível 1 não encontrada.');
      if (rows[0].parent_id !== null) {
        throw erro(400, 'A DRE tem só 2 níveis: não dá pra criar dentro de um item de nível 2.');
      }
      if (rows[0].totalizadora) throw erro(400, 'Máscara totalizadora não tem máscaras de nível 2.');
    }
    const { rows: maxRows } = await client.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM dre_mascaras
        WHERE empresa_id = $1 AND parent_id IS NOT DISTINCT FROM $2`,
      [empresaId, parentId]
    );
    const { rows } = await client.query(
      `INSERT INTO dre_mascaras (empresa_id, parent_id, ordem, descricao)
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

// `campos` é parcial: descricao, totalizadora e/ou realiza_poc — o que não vier fica como está.
async function update(id, empresaId, { descricao, totalizadora, realiza_poc: realizaPoc }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: atual } = await client.query(
      `SELECT m.parent_id, EXISTS (SELECT 1 FROM dre_mascaras f WHERE f.parent_id = m.id) AS tem_filhos
         FROM dre_mascaras m WHERE m.id = $1 AND m.empresa_id = $2 FOR UPDATE`,
      [id, empresaId]
    );
    if (!atual[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    if (totalizadora && atual[0].parent_id !== null) {
      throw erro(400, 'Só as máscaras de nível 1 podem ser Totalizadora.');
    }
    if (realizaPoc && atual[0].parent_id === null) {
      throw erro(400, 'Só as máscaras de nível 2 podem ser Realiza POC.');
    }
    if (totalizadora && atual[0].tem_filhos) {
      throw erro(400, 'Máscara totalizadora não tem máscaras de nível 2: remova ou mova as que estão dentro dela antes.');
    }
    const { rows } = await client.query(
      `UPDATE dre_mascaras
          SET descricao = COALESCE($3, descricao),
              totalizadora = COALESCE($4, totalizadora),
              realiza_poc = COALESCE($5, realiza_poc)
        WHERE id = $1 AND empresa_id = $2
       RETURNING ${COLUNAS}`,
      [id, empresaId, descricao ?? null, totalizadora ?? null, realizaPoc ?? null]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Remover um nível 1 leva junto os itens de nível 2 dele (ON DELETE CASCADE) — o front avisa
// isso na confirmação.
async function remove(id, empresaId) {
  const { rows } = await pool.query('DELETE FROM dre_mascaras WHERE id = $1 AND empresa_id = $2 RETURNING id', [
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
    const { rows: atuais } = await client.query(
      'SELECT id, totalizadora FROM dre_mascaras WHERE empresa_id = $1 FOR UPDATE',
      [empresaId]
    );
    const atuaisIds = new Set(atuais.map((r) => r.id));
    if (atuaisIds.size !== ids.length || ids.some((id) => !atuaisIds.has(id))) {
      throw erro(409, 'As máscaras foram alteradas em outro lugar. Recarregue a tela e tente de novo.');
    }
    const totalizadoras = new Set(atuais.filter((r) => r.totalizadora).map((r) => r.id));
    if (estrutura.some((raiz) => raiz.filhos.length > 0 && totalizadoras.has(raiz.id))) {
      throw erro(400, 'Máscara totalizadora não tem máscaras de nível 2.');
    }
    // Quem troca de nível perde a marcação que não vale no nível novo.
    await client.query(
      `UPDATE dre_mascaras m
          SET parent_id = v.parent_id, ordem = v.ordem,
              totalizadora = m.totalizadora AND v.parent_id IS NULL,
              realiza_poc = m.realiza_poc AND v.parent_id IS NOT NULL
         FROM UNNEST($2::int[], $3::int[], $4::int[]) AS v(id, parent_id, ordem)
        WHERE m.id = v.id AND m.empresa_id = $1`,
      [empresaId, ids, linhas.map((l) => l.parentId), linhas.map((l) => l.ordem)]
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

module.exports = { list, create, update, remove, reordenar };
