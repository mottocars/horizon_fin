const pool = require('../../config/db');

// Operações > DRE Gerencial > Máscaras: espelho de dfc-mascaras/dfcMascaras.service.js (mesma
// árvore de 2 níveis, mesma tela), na tabela dre_mascaras — mais as marcações totalizadora (só
// nível 1) e realiza_poc (só nível 2, com o tipo_poc opcional; ver
// 2026-10-22-dre-mascaras-flags.sql), e a origem / cálculo do nível 2 (ver
// 2026-10-22-dre-mascaras-origem-calculo.sql). Totalizadora nunca tem nível 2 dentro: create,
// update e reordenar recusam o que quebraria isso.

const COLUNAS = 'id, parent_id, ordem, descricao, totalizadora, realiza_poc, tipo_poc, icone, origem, calculo, imposto_base';

// Cálculos que cada origem oferece — mesma lista da constraint dre_mascaras_calculo_valido e das
// opções da tela (DreGerencial/MascarasTab.jsx). Imposto Fixo não tem cálculo: usa o histórico de
// alíquotas (listHistorico etc., abaixo).
const CALCULOS_POR_ORIGEM = {
  CONTRATOS_VENDAS: ['VALOR_VENDAS', 'ESTORNO_VENDAS', 'RECEITA_DISTRATO', 'ESTORNO_CUSTO'],
  UNIDADES_IMOBILIARIAS: ['RECEITA_PERMUTA'],
  FINANCEIRO: ['ENTRADAS_SAIDAS', 'CORRECAO_MONETARIA'],
  IMPOSTO_FIXO: [],
};

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Devolve já em árvore: nível 1 na ordem, cada um com seus `filhos` (nível 2) na ordem. Com a
// `aliquota_vigente` (a do histórico mais recente do Imposto Fixo, ou null) pra mostrar na linha.
async function list(empresaId, db = pool) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS},
            (SELECT h.aliquota::float FROM dre_mascaras_imposto_historico h
              WHERE h.mascara_id = m.id ORDER BY h.inicio DESC LIMIT 1) AS aliquota_vigente
       FROM dre_mascaras m
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

// `campos` é parcial: descricao, totalizadora, realiza_poc, tipo_poc, icone, origem e/ou calculo —
// o que não vier (undefined) fica como está; tipo_poc / icone / origem / calculo null limpam.
// Desmarcar realiza_poc limpa o tipo_poc junto; trocar ou limpar a origem limpa o calculo. O ícone
// '=' (IGUAL) não é escolhido: marcar totalizadora grava, desmarcar limpa.
async function update(
  id,
  empresaId,
  { descricao, totalizadora, realiza_poc: realizaPoc, tipo_poc: tipoPoc, icone, origem, calculo }
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: atual } = await client.query(
      `SELECT m.parent_id, m.realiza_poc, m.totalizadora, m.origem,
              EXISTS (SELECT 1 FROM dre_mascaras f WHERE f.parent_id = m.id) AS tem_filhos
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
      throw erro(400, 'Só as máscaras de nível 2 podem ter % POC.');
    }
    if (tipoPoc && !(realizaPoc ?? atual[0].realiza_poc)) {
      throw erro(400, 'Marque % POC antes de escolher o Tipo POC.');
    }
    if (totalizadora && atual[0].tem_filhos) {
      throw erro(400, 'Máscara totalizadora não tem máscaras de nível 2: remova ou mova as que estão dentro dela antes.');
    }
    if (icone && atual[0].parent_id !== null) {
      throw erro(400, 'Só as máscaras de nível 1 têm ícone.');
    }
    if (icone && (totalizadora ?? atual[0].totalizadora)) {
      throw erro(400, 'Linha com Totaliza tem sempre o ícone =.');
    }
    if (origem && atual[0].parent_id === null) {
      throw erro(400, 'Só as máscaras de nível 2 têm Origem.');
    }
    if (calculo) {
      const origemFinal = origem !== undefined ? origem : atual[0].origem;
      if (!origemFinal) throw erro(400, 'Escolha a Origem antes do Cálculo.');
      if (!CALCULOS_POR_ORIGEM[origemFinal].includes(calculo)) throw erro(400, 'Esse Cálculo não é da Origem escolhida.');
    }
    const { rows } = await client.query(
      `UPDATE dre_mascaras
          SET descricao = COALESCE($3, descricao),
              totalizadora = COALESCE($4, totalizadora),
              realiza_poc = COALESCE($5, realiza_poc),
              tipo_poc = CASE WHEN NOT COALESCE($5, realiza_poc) THEN NULL
                              WHEN $7 THEN $6
                              ELSE tipo_poc END,
              icone = CASE WHEN $4 IS TRUE THEN 'IGUAL'
                           WHEN $4 IS FALSE AND icone = 'IGUAL' THEN NULL
                           WHEN $13 THEN $12::varchar
                           ELSE icone END,
              origem = CASE WHEN $9 THEN $8::varchar ELSE origem END,
              calculo = CASE WHEN $11 THEN $10::varchar
                             WHEN $9 AND $8::varchar IS DISTINCT FROM origem THEN NULL
                             ELSE calculo END,
              -- A base do imposto só existe na origem Imposto Fixo.
              imposto_base = CASE WHEN $9 AND $8::varchar IS DISTINCT FROM 'IMPOSTO_FIXO' THEN NULL ELSE imposto_base END
        WHERE id = $1 AND empresa_id = $2
       RETURNING ${COLUNAS}`,
      [
        id,
        empresaId,
        descricao ?? null,
        totalizadora ?? null,
        realizaPoc ?? null,
        tipoPoc ?? null,
        tipoPoc !== undefined,
        origem ?? null,
        origem !== undefined,
        calculo ?? null,
        calculo !== undefined,
        icone ?? null,
        icone !== undefined,
      ]
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
              icone = CASE WHEN v.parent_id IS NULL THEN m.icone END,
              realiza_poc = m.realiza_poc AND v.parent_id IS NOT NULL,
              tipo_poc = CASE WHEN v.parent_id IS NOT NULL THEN m.tipo_poc END,
              origem = CASE WHEN v.parent_id IS NOT NULL THEN m.origem END,
              calculo = CASE WHEN v.parent_id IS NOT NULL THEN m.calculo END,
              imposto_base = CASE WHEN v.parent_id IS NOT NULL THEN m.imposto_base END
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

// ------------------------------------------------------------- histórico do Imposto Fixo
// Alíquotas da máscara com origem IMPOSTO_FIXO (dre_mascaras_imposto_historico), mais recente
// primeiro, com o `fim` calculado: o mês anterior ao início do histórico seguinte (null = vigente).
// Meses em 'AAAA-MM'. Devolve null se a máscara não é da empresa.
async function listHistorico(empresaId, mascaraId, db = pool) {
  const { rows: mascara } = await db.query('SELECT 1 FROM dre_mascaras WHERE id = $1 AND empresa_id = $2', [
    mascaraId,
    empresaId,
  ]);
  if (!mascara[0]) return null;
  const { rows } = await db.query(
    `SELECT id, to_char(inicio, 'YYYY-MM') AS inicio,
            to_char(LEAD(inicio) OVER (ORDER BY inicio) - INTERVAL '1 month', 'YYYY-MM') AS fim,
            aliquota::float AS aliquota
       FROM dre_mascaras_imposto_historico
      WHERE mascara_id = $1
      ORDER BY inicio DESC`,
    [mascaraId]
  );
  return rows;
}

// Cria um histórico começando em `inicio` ('AAAA-MM') — o que estava vigente antes passa a
// terminar no mês anterior (pelo cálculo do fim em listHistorico). Só pra origem Imposto Fixo.
async function createHistorico(empresaId, mascaraId, { inicio, aliquota }) {
  const { rows: mascara } = await pool.query('SELECT origem FROM dre_mascaras WHERE id = $1 AND empresa_id = $2', [
    mascaraId,
    empresaId,
  ]);
  if (!mascara[0]) return null;
  if (mascara[0].origem !== 'IMPOSTO_FIXO') throw erro(400, 'O histórico é só da origem Imposto Fixo.');
  try {
    await pool.query(
      `INSERT INTO dre_mascaras_imposto_historico (mascara_id, inicio, aliquota)
       VALUES ($1, to_date($2, 'YYYY-MM'), $3)`,
      [mascaraId, inicio, aliquota]
    );
  } catch (err) {
    if (err.code === '23505') {
      const [ano, mes] = inicio.split('-');
      throw erro(409, `Já existe um histórico começando em ${mes}/${ano}.`);
    }
    throw err;
  }
  return listHistorico(empresaId, mascaraId);
}

// ------------------------------------------------------------- base do Imposto Fixo
// Quais linhas de nível 2 acima do imposto formam a base dele (dre_mascaras.imposto_base — ver
// 2026-11-06-dre-mascaras-imposto-base.sql). `opcoes`: as linhas de nível 2 acima dele na ordem da
// DRE (grupo de nível 1, depois a ordem dentro dele), sem os outros impostos fixos — com `na_base`.
// `todas`: base NULL (todas acima, inclusive as que forem criadas depois). null = máscara não é da empresa.
async function getImpostoBase(empresaId, mascaraId, db = pool) {
  const { rows } = await db.query(
    `SELECT m.id, m.parent_id, m.descricao, m.origem, m.calculo, m.imposto_base, p.descricao AS grupo,
            p.ordem AS ordem_grupo, m.ordem
       FROM dre_mascaras m JOIN dre_mascaras p ON p.id = m.parent_id
      WHERE m.empresa_id = $1
      ORDER BY p.ordem, m.ordem, m.id`,
    [empresaId]
  );
  const i = rows.findIndex((r) => r.id === Number(mascaraId));
  if (i < 0) {
    const { rows: existe } = await db.query('SELECT origem FROM dre_mascaras WHERE id = $1 AND empresa_id = $2', [mascaraId, empresaId]);
    if (!existe[0]) return null;
    throw erro(400, 'A base do imposto é só de máscara de nível 2 com origem Imposto Fixo.');
  }
  const imposto = rows[i];
  const base = imposto.imposto_base ? new Set(imposto.imposto_base) : null;
  const opcoes = rows
    .slice(0, i)
    .filter((r) => r.origem !== 'IMPOSTO_FIXO')
    .map((r) => ({ id: r.id, descricao: r.descricao, grupo: r.grupo, origem: r.origem, calculo: r.calculo, na_base: base ? base.has(r.id) : true }));
  // Marcadas que não estão mais acima (moveram pra baixo ou foram apagadas): não contam.
  const foraDeOrdem = base ? [...base].filter((id) => !opcoes.some((o) => o.id === id)) : [];
  return { mascara_id: imposto.id, origem: imposto.origem, todas: !base, opcoes, ignoradas: foraDeOrdem };
}

// Grava a base: `mascaraIds` = as linhas marcadas (todas as de cima marcadas = NULL, "todas acima").
async function setImpostoBase(empresaId, mascaraId, mascaraIds) {
  const atual = await getImpostoBase(empresaId, mascaraId);
  if (!atual) return null;
  if (atual.origem !== 'IMPOSTO_FIXO') throw erro(400, 'A base é só da origem Imposto Fixo.');
  const validas = new Set(atual.opcoes.map((o) => o.id));
  const ids = [...new Set(mascaraIds.map(Number))];
  const invalida = ids.find((id) => !validas.has(id));
  if (invalida) throw erro(400, 'Só entram na base linhas de nível 2 acima do imposto na DRE (e que não sejam outro imposto fixo).');
  if (!ids.length) throw erro(400, 'Marque ao menos uma linha para a base do imposto.');
  const todas = ids.length === validas.size;
  await pool.query('UPDATE dre_mascaras SET imposto_base = $3 WHERE id = $1 AND empresa_id = $2', [
    mascaraId,
    empresaId,
    todas ? null : atual.opcoes.filter((o) => ids.includes(o.id)).map((o) => o.id),
  ]);
  return getImpostoBase(empresaId, mascaraId);
}

// Apagar um histórico faz o anterior voltar a valer até o início do próximo (ou ficar vigente).
async function removeHistorico(empresaId, mascaraId, historicoId) {
  const { rows } = await pool.query(
    `DELETE FROM dre_mascaras_imposto_historico h
      USING dre_mascaras m
      WHERE h.id = $1 AND h.mascara_id = $2 AND m.id = h.mascara_id AND m.empresa_id = $3
     RETURNING h.id`,
    [historicoId, mascaraId, empresaId]
  );
  if (!rows[0]) return null;
  return listHistorico(empresaId, mascaraId);
}

module.exports = {
  list,
  create,
  update,
  remove,
  reordenar,
  listHistorico,
  createHistorico,
  removeHistorico,
  getImpostoBase,
  setImpostoBase,
  CALCULOS_POR_ORIGEM,
};
