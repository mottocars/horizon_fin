const pool = require('../../config/db');
const dreMascaras = require('../dre-mascaras/dreMascaras.service');
const calculo = require('./calculo');
const demonstrativo = require('../dre-demonstrativo/demonstrativo.service');

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

// Versões da DRE (modules/dre-versoes): a Projeção não tem mais versões próprias — cada centro tem UM
// orçamento (versao_id NULL) e a versão é a da DRE inteira. O pedido roda no contexto de uma versão (a
// aberta, ou uma salva — config/db.js lê a cópia dela); `versaoDaDre` descreve essa versão pras telas, e o
// corte dela (último mês do realizado) é a trava de todo orçamento.
function versaoDaDre() {
  const ctx = pool.contextoAtual();
  if (!ctx?.versao) return null;
  const v = ctx.versao;
  return {
    numero: v.numero,
    status: v.status,
    criado_em: v.fechada_em || v.aberta_em,
    usuario: v.fechada_por_nome || v.aberta_por_nome || null,
    corte: v.corte.slice(0, 7),
  };
}
const corteDaVersao = () => pool.contextoAtual()?.corte?.slice(0, 7) || null;
const emLeitura = () => pool.contextoAtual()?.modo === 'leitura';

// A aba: colunas (o nível 1 da Máscara DRE), a versão da DRE e os orçamentos (um por centro) — cada um com o
// fechamento do nível 1 (do primeiro lançamento ao fim do ciclo, da foto). `orcamentos` fica vazio (era o
// das versões só da Projeção); tudo vem em `rascunhos`.
async function listar(empresaId) {
  const arvore = await dreMascaras.list(empresaId);
  const { rows } = await pool.query(
    `SELECT ${COLUNAS}, o.resultado -> 'niveis1' AS niveis1, o.resultado -> 'mensal' AS mensal
       ${JUNCOES}
      WHERE o.empresa_id = $1 AND o.versao_id IS NULL
      ORDER BY c.dre_ordem ASC NULLS LAST, c.sienge_id ASC`,
    [empresaId]
  );
  const linha = ({ niveis1, mensal, ...r }) => {
    const n1 = mensal?.meses ? calculo.niveis1DaFoto(arvore, mensal) : niveis1;
    return { ...r, totais: n1 ? Object.fromEntries(n1.map((n) => [n.id, n.total])) : null };
  };
  return {
    versao: versaoDaDre(),
    corte: corteDaVersao(),
    somente_leitura: emLeitura(),
    colunas: arvore.map((g) => ({ id: g.id, descricao: g.descricao, totalizadora: g.totalizadora })),
    orcamentos: [],
    rascunhos: rows.map(linha),
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

  // O realizado vai até o corte da versão da DRE (o último mês fechado) — a mesma trava pra todo orçamento.
  const corte = corteDaVersao();
  const agora = new Date();
  const { rows } = await pool.query(
    `INSERT INTO dre_projecao_orcamentos
       (empresa_id, centro_id, etapa, ciclo_inicio, ciclo_fim, trava, dados, usuario_id, criado_em, atualizado_em)
     VALUES ($1, $2, 'historico', $3::date, $4::date, $5::date, $6, $7, $8, $8) RETURNING id`,
    [empresaId, centroId, `${cicloInicio}-01`, `${cicloFim}-01`, corte ? `${corte}-01` : null, {}, usuarioId, agora]
  );
  return obter(empresaId, rows[0].id);
}

// Grava o que vier (etapa, ciclo, dados — o assistente manda a cada mudança). Mudou ciclo ou dados: volta pra
// EM_ANDAMENTO e descarta a foto do cálculo. A trava é sempre o corte da versão da DRE (o que vier dela é
// ignorado); orçamento de antes das versões com outra trava passa a ter a do corte na próxima gravação.
async function atualizar(empresaId, id, patch, usuarioId) {
  const orc = await rascunho(empresaId, id);
  const ciclo = {
    inicio: patch.cicloInicio ?? orc.ciclo_inicio,
    fim: patch.cicloFim ?? orc.ciclo_fim,
  };
  if (!mesValido(ciclo.inicio) || !mesValido(ciclo.fim)) throw erro(400, 'Mês do ciclo inválido.');
  if (ciclo.fim < ciclo.inicio) throw erro(400, 'O fim do ciclo não pode ser antes do início.');
  const corte = corteDaVersao();
  // Só mudar a etapa (navegar no assistente) não mexe na trava nem no status.
  const mudou = patch.cicloInicio !== undefined || patch.cicloFim !== undefined || patch.dados !== undefined || (!corte && patch.trava !== undefined);
  const trava = corte ? (mudou ? corte : orc.trava) : patch.trava !== undefined ? patch.trava : orc.trava;
  if (trava !== null && !mesValido(trava)) throw erro(400, 'Mês da trava inválido.');
  if (!corte && trava !== null && trava >= ciclo.fim) throw erro(400, 'A trava precisa ser antes do fim do ciclo.');
  if (patch.etapa !== undefined && !ETAPAS.includes(patch.etapa)) throw erro(400, 'Etapa inválida.');
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

// Calcula e guarda a foto: o orçamento fica CONCLUIDO (pra salvar a versão da DRE, todos têm de estar).
async function concluir(empresaId, id, usuarioId) {
  const orc = await rascunho(empresaId, id);
  const corte = corteDaVersao();
  const resultado = await calculo.calcular(empresaId, orc);
  const agora = new Date();
  await pool.query(
    `UPDATE dre_projecao_orcamentos
        SET status = 'CONCLUIDO', etapa = 'conclusao', resultado = $3, concluido_em = $4, atualizado_em = $4, usuario_id = $5,
            trava = COALESCE($6::date, trava)
      WHERE empresa_id = $1 AND id = $2 AND versao_id IS NULL`,
    [empresaId, id, { ...resultado, calculado_em: agora }, agora, usuarioId, corte ? `${corte}-01` : null]
  );
  return obter(empresaId, id);
}

// Os meses até a trava da foto mês a mês (`mensal`) são o REALIZADO, relido agora pela mesma conta da aba
// DRE (dentro da versão do pedido: o realizado dela, até o corte) — a foto guarda o realizado do dia em que
// o orçamento foi concluído. Do mês seguinte à trava em diante a foto vale como está. Muda `mensal` no lugar
// (nunca grava no banco).
async function realizadoAoVivo(empresaId, orcamentos) {
  const alvo = orcamentos.filter((o) => o.mensal?.meses?.length && o.mensal.trava);
  if (!alvo.length) return;
  const primeiro = alvo.map((o) => o.mensal.meses[0]).sort()[0];
  const ultima = alvo.map((o) => o.mensal.trava).sort().pop();
  if (primeiro > ultima) return;
  const r = await demonstrativo.calcular(empresaId, {
    de: `${primeiro}-01`,
    ate: calculo.fimMes(ultima),
    centros: [...new Set(alvo.map((o) => o.centro_id))],
  });
  const porCentro = new Map(r.por_centro.map((c) => [Number(c.id), new Map(c.meses.map((m) => [m.mes, m.valores]))]));
  alvo.forEach((orc) => {
    const vivo = porCentro.get(Number(orc.centro_id));
    if (!vivo) return;
    const { mensal } = orc;
    mensal.meses.forEach((mes, i) => {
      if (mes > mensal.trava) return;
      const v = vivo.get(mes);
      if (!v) return;
      Object.keys(mensal.valores).forEach((mid) => {
        const x = v[mid];
        mensal.valores[mid][i] = x === null || x === undefined ? null : Math.round(x * 100) / 100;
      });
    });
  });
}

// Os orçamentos da versão do pedido, um por centro (a aberta: os de trabalho; uma salva: os da cópia dela).
// `completo`: a foto inteira (`resultado`: premissas, POCs, níveis); senão só o `mensal`. Orçamento sem a
// foto mês a mês (em andamento, ou concluído antes de ela existir) é calculado na hora (`calculado_agora`);
// no concluído da versão aberta, o `mensal` que faltava é gravado nele (uma vez). A trava de todos é o corte
// da versão: num orçamento concluído antes com trava mais antiga, os meses até o corte viram realizado.
// Orçamento que não dá pra calcular (ex.: centro sem "Realiza DRE") fica de fora, com o motivo em `avisos`.
// (`fonte`/`numero`: compatibilidade — a versão é a do contexto.)
async function orcamentosDaFonte(empresaId, { centros = [], completo = false } = {}) {
  const corte = corteDaVersao();
  const leitura = emLeitura();
  const { rows } = await pool.query(
    `SELECT ${COLUNAS}, o.dados, ${completo ? 'o.resultado' : "o.resultado -> 'mensal' AS mensal"}
       ${JUNCOES}
      WHERE o.empresa_id = $1 AND o.versao_id IS NULL
        AND (cardinality($2::int[]) = 0 OR o.centro_id = ANY($2::int[]))
      ORDER BY c.dre_ordem ASC NULLS LAST, c.sienge_id ASC`,
    [empresaId, centros.map(Number)]
  );
  const avisos = [];
  const orcamentos = [];
  const arvore = completo && rows.length ? await dreMascaras.list(empresaId) : null;
  for (const orc of rows) {
    const origem = leitura ? 'VERSAO' : 'RASCUNHO';
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
        if (!leitura && orc.status === 'CONCLUIDO') {
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
    if (corte && mensal) {
      mensal = { ...mensal, trava: corte };
      if (completo) resultado = { ...resultado, mensal };
    }
    orcamentos.push({ ...orc, origem, mensal, resultado, calculado_agora: calculadoAgora });
  }
  await realizadoAoVivo(empresaId, orcamentos);
  if (completo) orcamentos.forEach((o) => { o.resultado = comFechamento(o.resultado, arvore); });
  return { fonte: leitura ? 'versao' : 'atual', versao: versaoDaDre(), versoes: [], tem_rascunhos: false, orcamentos, avisos };
}

// Projetado da aba DRE e do dashboard (colunas Projetado / Desvio %), por centro e mês, de `de` a `ate`:
//   - do mês seguinte ao corte da versão em diante: a projeção desta versão (a foto mês a mês do orçamento);
//   - até o corte (meses que já fecharam e mostram o realizado): o projetado da última versão salva em que
//     aquele mês ainda era projeção (dre_versao_projetado) — o Desvio compara o realizado com o que se
//     esperava. Sem versão anterior guardada (ficam só as 10 últimas), o mês fica sem projetado.
// `versao_do_mes`: de qual versão veio o projetado de cada mês até o corte.
async function projetado(empresaId, { de, ate, centros = [] }) {
  const f = await orcamentosDaFonte(empresaId, { centros });
  const mesDe = de.slice(0, 7);
  const mesAte = ate.slice(0, 7);
  const corte = corteDaVersao();
  const porCentro = new Map();
  const doCentro = (id, base = {}) => {
    if (!porCentro.has(id)) porCentro.set(id, { ...base, meses: new Map(), versao_do_mes: {} });
    return porCentro.get(id);
  };
  f.orcamentos.forEach((orc) => {
    const { mensal } = orc;
    const c = doCentro(Number(orc.centro_id), { origem: orc.origem, status: orc.status, trava: mensal.trava });
    mensal.meses.forEach((m, i) => {
      if (m < mesDe || m > mesAte || (corte && m <= corte)) return;
      c.meses.set(m, Object.fromEntries(Object.entries(mensal.valores).map(([mid, vs]) => [mid, vs[i]])));
    });
  });
  const ctx = pool.contextoAtual();
  if (corte && ctx?.versao && mesDe <= corte) {
    const { rows } = await pool.base.query(
      `SELECT DISTINCT ON (p.centro_id, p.mes) p.centro_id, p.mes, p.valores, v.numero
         FROM dre_versao_projetado p JOIN dre_versoes v ON v.id = p.versao_id
        WHERE v.empresa_id = $1 AND v.status = 'FECHADA' AND v.numero < $2 AND p.mes > to_char(v.corte, 'YYYY-MM')
          AND p.mes >= $3 AND p.mes <= $4 AND (cardinality($5::int[]) = 0 OR p.centro_id = ANY($5::int[]))
        ORDER BY p.centro_id, p.mes, v.numero DESC`,
      [empresaId, ctx.versao.numero, mesDe, mesAte < corte ? mesAte : corte, centros.map(Number)]
    );
    rows.forEach((r) => {
      const c = doCentro(Number(r.centro_id), { origem: 'VERSAO_ANTERIOR', status: 'CONCLUIDO', trava: corte });
      c.meses.set(r.mes, r.valores);
      c.versao_do_mes[r.mes] = r.numero;
    });
  }
  const saida = {};
  porCentro.forEach((c, id) => {
    const meses = [...c.meses.keys()].sort();
    const mids = [...new Set(meses.flatMap((m) => Object.keys(c.meses.get(m))))];
    saida[id] = {
      origem: c.origem,
      status: c.status,
      trava: corte || c.trava,
      meses,
      valores: Object.fromEntries(mids.map((mid) => [mid, meses.map((m) => c.meses.get(m)[mid] ?? null)])),
      versao_do_mes: c.versao_do_mes,
    };
  });
  return {
    fonte: f.fonte,
    versao: f.versao,
    versoes: [],
    tem_rascunhos: false,
    centros: saida,
    // Sem aviso na tela (pedido do usuário): o que não deu pra calcular só fica sem projeção.
    avisos: [],
  };
}

module.exports = {
  ETAPAS,
  projetado,
  orcamentosDaFonte,
  versaoDaDre,
  corteDaVersao,
  listar,
  obter,
  criar,
  atualizar,
  descartar,
  concluir,
  historico: async (empresaId, id, ate) => calculo.historico(empresaId, await obter(empresaId, id), ate),
  unidades: async (empresaId, id) => calculo.unidades(empresaId, await obter(empresaId, id)),
  contas: async (empresaId, id, etapa) => calculo.contas(empresaId, await obter(empresaId, id), etapa),
  calcular: async (empresaId, id) => calculo.calcular(empresaId, await obter(empresaId, id)),
};
