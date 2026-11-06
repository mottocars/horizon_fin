const pool = require('../../config/db');
const dreMascaras = require('../dre-mascaras/dreMascaras.service');
const calculo = require('./calculo');

// Operações > DRE Construtoras > aba Projeções: os orçamentos (projeção da DRE) por centro de custo —
// rascunhos do assistente e versões (database/migrations/2026-11-05-dre-projecoes.sql). O cálculo
// fica em calculo.js.
//   - Rascunho (versao_id NULL): um por centro; o assistente grava a cada mudança (etapa, ciclo,
//     trava, dados). Qualquer mudança volta o rascunho pra EM_ANDAMENTO.
//   - Concluir: calcula e guarda a foto (resultado); fica CONCLUIDO, aguardando "Salvar versão".
//   - Salvar versão: nova versão da empresa com os concluídos e, nos outros centros, os orçamentos da
//     versão anterior.

const ETAPAS = ['centro', 'historico', 'vendas', 'custos', 'poc', 'demais', 'conclusao'];

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const COLUNAS = `o.id, o.centro_id, o.versao_id, o.status, o.etapa,
  to_char(o.ciclo_inicio, 'YYYY-MM') AS ciclo_inicio, to_char(o.ciclo_fim, 'YYYY-MM') AS ciclo_fim,
  to_char(o.trava, 'YYYY-MM') AS trava, o.criado_em, o.atualizado_em, o.concluido_em,
  u.nome AS usuario, c.name AS centro_nome, NULLIF(TRIM(c.apelido), '') AS centro_apelido, c.natureza`;
const JUNCOES = `FROM dre_projecao_orcamentos o
  JOIN centros_custo_sienge c ON c.empresa_id = o.empresa_id AND c.sienge_id = o.centro_id
  LEFT JOIN usuarios u ON u.id = o.usuario_id`;

// O fechamento do nível 1 (`niveis1`) refeito pela foto mês a mês: do primeiro lançamento do centro ao
// fim do ciclo, como a coluna Projetado da aba DRE. As fotos gravadas antes de 06/11/2026 somavam só a
// partir do início do ciclo; assim elas mostram o fechamento completo sem precisar concluir de novo.
function comFechamento(resultado, arvore) {
  if (!resultado?.mensal?.meses) return resultado;
  return {
    ...resultado,
    janela: resultado.janela ? { ...resultado.janela, realizado_de: resultado.mensal.meses[0] || null } : resultado.janela,
    niveis1: calculo.niveis1DaFoto(arvore, resultado.mensal),
  };
}

async function ultimaVersao(db, empresaId) {
  const { rows } = await db.query(
    `SELECT v.id, v.numero, v.criado_em, v.orcamentos, u.nome AS usuario
       FROM dre_projecao_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
    [empresaId]
  );
  return rows[0] || null;
}

// A aba: colunas (o nível 1 da Máscara DRE), a última versão salva com os orçamentos dela e os
// rascunhos — cada um com o fechamento do nível 1 (do primeiro lançamento ao fim do ciclo, da foto).
async function listar(empresaId) {
  const [versao, arvore] = await Promise.all([ultimaVersao(pool, empresaId), dreMascaras.list(empresaId)]);
  const { rows } = await pool.query(
    `SELECT ${COLUNAS}, o.resultado -> 'niveis1' AS niveis1, o.resultado -> 'mensal' AS mensal
       ${JUNCOES}
      WHERE o.empresa_id = $1 AND (o.versao_id IS NULL OR o.versao_id = $2)
      ORDER BY c.dre_ordem ASC NULLS LAST, c.sienge_id ASC`,
    [empresaId, versao?.id ?? -1]
  );
  const linha = ({ niveis1, mensal, ...r }) => {
    const n1 = mensal?.meses ? calculo.niveis1DaFoto(arvore, mensal) : niveis1;
    return { ...r, totais: n1 ? Object.fromEntries(n1.map((n) => [n.id, n.total])) : null };
  };
  return {
    versao,
    colunas: arvore.map((g) => ({ id: g.id, descricao: g.descricao, totalizadora: g.totalizadora })),
    orcamentos: rows.filter((r) => r.versao_id !== null).map(linha),
    rascunhos: rows.filter((r) => r.versao_id === null).map(linha),
  };
}

async function obter(empresaId, id, db = pool) {
  const { rows } = await db.query(`SELECT ${COLUNAS}, o.dados, o.resultado ${JUNCOES} WHERE o.empresa_id = $1 AND o.id = $2`, [
    empresaId,
    id,
  ]);
  if (!rows[0]) throw erro(404, 'Orçamento não encontrado.');
  if (rows[0].resultado?.mensal) rows[0].resultado = comFechamento(rows[0].resultado, await dreMascaras.list(empresaId));
  return rows[0];
}

async function rascunho(empresaId, id) {
  const orc = await obter(empresaId, id);
  if (orc.versao_id !== null) throw erro(400, 'Este orçamento já está numa versão salva e não pode ser alterado.');
  return orc;
}

const mesValido = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

// Novo orçamento de um centro (ou o rascunho que já existe dele, com `existente`). Com orçamento na
// última versão, o rascunho começa com o que foi informado nele.
async function criar(empresaId, { centroId, cicloInicio, cicloFim }, usuarioId) {
  if (!mesValido(cicloInicio) || !mesValido(cicloFim)) throw erro(400, 'Informe o mês de início e de fim do ciclo.');
  if (cicloFim < cicloInicio) throw erro(400, 'O fim do ciclo não pode ser antes do início.');
  const { rows: centro } = await pool.query(
    'SELECT name, natureza, realiza_dre FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, centroId]
  );
  if (!centro[0]) throw erro(404, 'Centro de custo não encontrado.');
  if (!centro[0].realiza_dre) throw erro(400, `${centro[0].name} não está com "Realiza DRE" marcado na aba Centros Custos.`);
  if (!centro[0].natureza) throw erro(400, `Defina o Tipo (Obra ou Administrativo) de ${centro[0].name} na aba Centros Custos.`);

  const { rows: existente } = await pool.query(
    'SELECT id FROM dre_projecao_orcamentos WHERE empresa_id = $1 AND centro_id = $2 AND versao_id IS NULL',
    [empresaId, centroId]
  );
  if (existente[0]) return { ...(await obter(empresaId, existente[0].id)), existente: true };

  const versao = await ultimaVersao(pool, empresaId);
  let dados = {};
  if (versao) {
    const { rows } = await pool.query('SELECT dados FROM dre_projecao_orcamentos WHERE versao_id = $1 AND centro_id = $2', [
      versao.id,
      centroId,
    ]);
    if (rows[0]) dados = rows[0].dados;
  }
  const agora = new Date();
  const { rows } = await pool.query(
    `INSERT INTO dre_projecao_orcamentos
       (empresa_id, centro_id, etapa, ciclo_inicio, ciclo_fim, dados, usuario_id, criado_em, atualizado_em)
     VALUES ($1, $2, 'historico', $3::date, $4::date, $5, $6, $7, $7) RETURNING id`,
    [empresaId, centroId, `${cicloInicio}-01`, `${cicloFim}-01`, dados, usuarioId, agora]
  );
  return obter(empresaId, rows[0].id);
}

// Grava o que vier (etapa, ciclo, trava, dados — o assistente manda a cada mudança). Mudou ciclo, trava
// ou dados: volta pra EM_ANDAMENTO e descarta a foto do cálculo.
async function atualizar(empresaId, id, patch, usuarioId) {
  const orc = await rascunho(empresaId, id);
  const ciclo = {
    inicio: patch.cicloInicio ?? orc.ciclo_inicio,
    fim: patch.cicloFim ?? orc.ciclo_fim,
  };
  if (!mesValido(ciclo.inicio) || !mesValido(ciclo.fim)) throw erro(400, 'Mês do ciclo inválido.');
  if (ciclo.fim < ciclo.inicio) throw erro(400, 'O fim do ciclo não pode ser antes do início.');
  const trava = patch.trava !== undefined ? patch.trava : orc.trava;
  if (trava !== null && !mesValido(trava)) throw erro(400, 'Mês da trava inválido.');
  if (trava !== null && trava >= ciclo.fim) throw erro(400, 'A trava precisa ser antes do fim do ciclo.');
  if (patch.etapa !== undefined && !ETAPAS.includes(patch.etapa)) throw erro(400, 'Etapa inválida.');
  const mudou = patch.cicloInicio !== undefined || patch.cicloFim !== undefined || patch.trava !== undefined || patch.dados !== undefined;
  await pool.query(
    `UPDATE dre_projecao_orcamentos
        SET etapa = $3, ciclo_inicio = $4::date, ciclo_fim = $5::date, trava = $6::date, dados = $7,
            status = CASE WHEN $8 THEN 'EM_ANDAMENTO' ELSE status END,
            resultado = CASE WHEN $8 THEN NULL ELSE resultado END,
            concluido_em = CASE WHEN $8 THEN NULL ELSE concluido_em END,
            usuario_id = $9, atualizado_em = $10
      WHERE empresa_id = $1 AND id = $2 AND versao_id IS NULL`,
    [
      empresaId,
      id,
      patch.etapa ?? orc.etapa,
      `${ciclo.inicio}-01`,
      `${ciclo.fim}-01`,
      trava ? `${trava}-01` : null,
      patch.dados ?? orc.dados,
      mudou,
      usuarioId,
      new Date(),
    ]
  );
  return obter(empresaId, id);
}

async function descartar(empresaId, id) {
  const { rowCount } = await pool.query('DELETE FROM dre_projecao_orcamentos WHERE empresa_id = $1 AND id = $2 AND versao_id IS NULL', [
    empresaId,
    id,
  ]);
  if (!rowCount) throw erro(404, 'Rascunho não encontrado.');
  return { ok: true };
}

// Calcula e guarda a foto: o rascunho fica CONCLUIDO, aguardando "Salvar versão".
async function concluir(empresaId, id, usuarioId) {
  const orc = await rascunho(empresaId, id);
  const resultado = await calculo.calcular(empresaId, orc);
  const agora = new Date();
  await pool.query(
    `UPDATE dre_projecao_orcamentos
        SET status = 'CONCLUIDO', etapa = 'conclusao', resultado = $3, concluido_em = $4, atualizado_em = $4, usuario_id = $5
      WHERE empresa_id = $1 AND id = $2 AND versao_id IS NULL`,
    [empresaId, id, { ...resultado, calculado_em: agora }, agora, usuarioId]
  );
  return obter(empresaId, id);
}

// Nova versão: os rascunhos concluídos e, nos centros sem rascunho concluído, os orçamentos da versão
// anterior (copiados). Os rascunhos em andamento continuam rascunho.
async function salvarVersao(empresaId, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', ['dre_projecao_versao', empresaId]);
    const { rows: concluidos } = await client.query(
      `SELECT id, centro_id FROM dre_projecao_orcamentos
        WHERE empresa_id = $1 AND versao_id IS NULL AND status = 'CONCLUIDO'`,
      [empresaId]
    );
    if (!concluidos.length) throw erro(400, 'Conclua ao menos um orçamento antes de salvar a versão.');
    const anterior = await ultimaVersao(client, empresaId);
    const { rows: nova } = await client.query(
      `INSERT INTO dre_projecao_versoes (empresa_id, numero, usuario_id, criado_em, orcamentos)
       VALUES ($1, $2, $3, $4, 0) RETURNING id, numero`,
      [empresaId, (anterior?.numero || 0) + 1, usuarioId, new Date()]
    );
    const versaoId = nova[0].id;
    if (anterior) {
      await client.query(
        `INSERT INTO dre_projecao_orcamentos
           (empresa_id, centro_id, versao_id, status, etapa, ciclo_inicio, ciclo_fim, trava, dados, resultado,
            usuario_id, criado_em, atualizado_em, concluido_em)
         SELECT empresa_id, centro_id, $2, status, etapa, ciclo_inicio, ciclo_fim, trava, dados, resultado,
                usuario_id, criado_em, atualizado_em, concluido_em
           FROM dre_projecao_orcamentos
          WHERE empresa_id = $1 AND versao_id = $3 AND NOT (centro_id = ANY($4::int[]))`,
        [empresaId, versaoId, anterior.id, concluidos.map((c) => c.centro_id)]
      );
    }
    await client.query('UPDATE dre_projecao_orcamentos SET versao_id = $2 WHERE empresa_id = $1 AND id = ANY($3::int[])', [
      empresaId,
      versaoId,
      concluidos.map((c) => c.id),
    ]);
    const { rows: n } = await client.query('SELECT count(*)::int AS n FROM dre_projecao_orcamentos WHERE versao_id = $1', [versaoId]);
    await client.query('UPDATE dre_projecao_versoes SET orcamentos = $2 WHERE id = $1', [versaoId, n[0].n]);
    await client.query('COMMIT');
    return { numero: nova[0].numero, orcamentos: n[0].n, novos: concluidos.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Projetado da aba DRE (colunas Projetado / Desvio): por centro, a DRE do orçamento mês a mês (a foto
// `resultado.mensal`: realizado até o corte + projetado depois) nos meses de `de` a `ate`.
//   fonte 'atual'  — Operações: o rascunho do centro (concluído: a foto; em andamento: calculado agora)
//                    e, sem rascunho, o orçamento da última versão;
//   fonte 'versao' — só uma versão salva (`numero`; sem ele, a última) — os dashboards.
// `centros`: ids (vazio = todos). Devolve também as versões salvas (pro seletor).
// Os orçamentos de uma fonte, um por centro (a mesma escolha da coluna Projetado da aba DRE):
//   fonte 'atual'  — o rascunho do centro e, sem rascunho, o orçamento da última versão;
//   fonte 'versao' — os da versão `numero` (sem ele, a última).
// `completo`: a foto inteira (`resultado`: premissas, POCs, níveis); senão só o `mensal`. Orçamento sem a
// foto mês a mês (rascunho em andamento, ou concluído antes de ela existir) é calculado na hora — com as
// premissas da foto quando há foto (`calculado_agora` marca); no da versão, o `mensal` que faltava é
// gravado nele (uma vez). Orçamento que não dá pra calcular (ex.: centro sem "Realiza DRE") fica de fora,
// com o motivo em `avisos`.
async function orcamentosDaFonte(empresaId, { fonte = 'atual', numero = null, centros = [], completo = false }) {
  const { rows: versoes } = await pool.query(
    `SELECT v.id, v.numero, v.criado_em, v.orcamentos, u.nome AS usuario FROM dre_projecao_versoes v
       LEFT JOIN usuarios u ON u.id = v.usuario_id WHERE v.empresa_id = $1 ORDER BY v.numero DESC`,
    [empresaId]
  );
  const versao = numero ? versoes.find((v) => v.numero === Number(numero)) : versoes[0];
  if (numero && !versao) throw erro(404, `Versão ${numero} não encontrada.`);
  // Se há rascunho na empresa (o filtro Versão da aba DRE só oferece "Rascunhos" quando há).
  const { rows: rasc } = await pool.query('SELECT EXISTS (SELECT 1 FROM dre_projecao_orcamentos WHERE empresa_id = $1 AND versao_id IS NULL) AS tem', [
    empresaId,
  ]);
  const { rows } = await pool.query(
    `SELECT ${COLUNAS}, o.dados, ${completo ? 'o.resultado' : "o.resultado -> 'mensal' AS mensal"}
       ${JUNCOES}
      WHERE o.empresa_id = $1
        AND (($2::int IS NOT NULL AND o.versao_id = $2) OR ($3 AND o.versao_id IS NULL))
        AND (cardinality($4::int[]) = 0 OR o.centro_id = ANY($4::int[]))
      ORDER BY c.dre_ordem ASC NULLS LAST, c.sienge_id ASC`,
    [empresaId, versao?.id ?? null, fonte === 'atual', centros.map(Number)]
  );
  const avisos = [];
  const orcamentos = [];
  const arvore = completo && rows.length ? await dreMascaras.list(empresaId) : null;
  const ids = [...new Set(rows.map((r) => r.centro_id))];
  for (const id of ids) {
    const rascunho = fonte === 'atual' ? rows.find((r) => r.centro_id === id && r.versao_id === null) : null;
    const orc = rascunho || rows.find((r) => r.centro_id === id && r.versao_id !== null);
    if (!orc) continue;
    const origem = orc.versao_id === null ? 'RASCUNHO' : 'VERSAO';
    let resultado = completo ? orc.resultado : null;
    let mensal = completo ? orc.resultado?.mensal : orc.mensal;
    let calculadoAgora = false;
    if (!mensal) {
      try {
        const foto = completo ? orc.resultado : null;
        const r = await calculo.calcular(empresaId, orc, { foto });
        mensal = r.mensal;
        if (completo) resultado = { ...(orc.resultado || r), mensal: r.mensal };
        calculadoAgora = true;
        if (orc.versao_id !== null) {
          await pool.query(
            `UPDATE dre_projecao_orcamentos SET resultado = jsonb_set(COALESCE(resultado, '{}'::jsonb), '{mensal}', $3::jsonb)
              WHERE empresa_id = $1 AND id = $2 AND NOT (COALESCE(resultado, '{}'::jsonb) ? 'mensal')`,
            [empresaId, orc.id, JSON.stringify(mensal)]
          );
        }
      } catch (e) {
        avisos.push(`${orc.centro_apelido || orc.centro_nome}: ${e.expose ? e.message : 'não foi possível calcular o orçamento.'}`);
        continue;
      }
    }
    if (completo) resultado = comFechamento(resultado, arvore);
    orcamentos.push({ ...orc, origem, mensal, resultado, calculado_agora: calculadoAgora });
  }
  return {
    fonte,
    versao: versao ? { numero: versao.numero, criado_em: versao.criado_em, usuario: versao.usuario, orcamentos: versao.orcamentos } : null,
    versoes: versoes.map(({ numero: n, criado_em: c, usuario: u }) => ({ numero: n, criado_em: c, usuario: u })),
    tem_rascunhos: rasc[0].tem,
    orcamentos,
    avisos,
  };
}

async function projetado(empresaId, { fonte = 'atual', numero = null, de, ate, centros = [] }) {
  const f = await orcamentosDaFonte(empresaId, { fonte, numero, centros });
  const mesDe = de.slice(0, 7);
  const mesAte = ate.slice(0, 7);
  const saida = {};
  f.orcamentos.forEach((orc) => {
    const { mensal } = orc;
    const idx = mensal.meses.map((m, i) => [m, i]).filter(([m]) => m >= mesDe && m <= mesAte);
    saida[orc.centro_id] = {
      origem: orc.origem,
      status: orc.status,
      trava: mensal.trava,
      meses: idx.map(([m]) => m),
      valores: Object.fromEntries(Object.entries(mensal.valores).map(([mid, vs]) => [mid, idx.map(([, i]) => vs[i])])),
    };
  });
  return {
    fonte,
    versao: f.versao ? { numero: f.versao.numero, criado_em: f.versao.criado_em, usuario: f.versao.usuario } : null,
    versoes: f.versoes,
    tem_rascunhos: f.tem_rascunhos,
    centros: saida,
    // Sem aviso na tela (pedido do usuário): o que não deu pra calcular só fica sem projeção.
    avisos: [],
  };
}

module.exports = {
  ETAPAS,
  projetado,
  orcamentosDaFonte,
  ultimaVersao: (empresaId) => ultimaVersao(pool, empresaId),
  listar,
  obter,
  criar,
  atualizar,
  descartar,
  concluir,
  salvarVersao,
  historico: async (empresaId, id, ate) => calculo.historico(empresaId, await obter(empresaId, id), ate),
  unidades: async (empresaId, id) => calculo.unidades(empresaId, await obter(empresaId, id)),
  contas: async (empresaId, id, etapa) => calculo.contas(empresaId, await obter(empresaId, id), etapa),
  calcular: async (empresaId, id) => calculo.calcular(empresaId, await obter(empresaId, id)),
};
