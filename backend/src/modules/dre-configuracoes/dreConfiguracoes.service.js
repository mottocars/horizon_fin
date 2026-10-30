const pool = require('../../config/db');
const financeiro = require('../dre-financeiro/financeiro.service');

// Operações > DRE Gerencial > aba Configurações (por empresa — database/migrations/
// 2026-10-30-dre-configuracoes.sql):
//   POC de Receita — qual Máscara DRE de nível 2 é o custo da obra. POC Receita = custo acumulado
//     dessa máscara (linhas da aba Financeiro, desde o começo) ÷ orçamento vigente da obra (aba
//     Orçamento: o de início mais recente até hoje, somadas as categorias), limitada a 100%. Guardada
//     pelo id: o nome da máscara pode mudar, ou ser outra.
//   POC de Despesa — fração ideal vendida (vendas ativas + permutas, aba Unidades): não configurável;
//     aparece na prévia ao lado da de receita.
//   Tipos de documento financeiro fora da DRE — somem da aba Financeiro. Só os excluídos ficam
//     gravados: tipo novo que chegar do Sienge entra sempre considerado.

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

// Data de hoje pelo relógio da aplicação (o do Postgres da VPS é deslocado).
function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Tudo o que a aba mostra (menos a prévia, que vem à parte por ser mais pesada).
async function obter(empresaId) {
  const [{ rows: cfg }, { rows: mascaras }, { rows: documentos }, { rows: excluidos }] = await Promise.all([
    pool.query(
      `SELECT c.poc_receita_mascara_id, c.atualizado_em, u.nome AS usuario
         FROM dre_configuracoes c LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT m.id, m.parent_id, m.descricao, m.ordem, m.realiza_poc, m.tipo_poc, m.totalizadora,
              COALESCE(p.ordem, m.ordem) AS ordem_grupo
         FROM dre_mascaras m LEFT JOIN dre_mascaras p ON p.id = m.parent_id
        WHERE m.empresa_id = $1
        ORDER BY ordem_grupo, m.parent_id NULLS FIRST, m.ordem`,
      [empresaId]
    ),
    // Tipos de documento que existem nos lançamentos da empresa: títulos a pagar (P), a receber (R)
    // e movimentos do extrato sem título (E), com quantos lançamentos cada.
    pool.query(
      `SELECT documento, MAX(nome) AS nome, SUM(n)::int AS lancamentos, string_agg(DISTINCT origem, '' ORDER BY origem) AS origens
         FROM (SELECT TRIM(document_identification_id) AS documento, MAX(document_identification_name) AS nome,
                      COUNT(DISTINCT bill_id) AS n, 'P' AS origem
                 FROM sie_outcome WHERE empresa_id = $1 AND NULLIF(TRIM(document_identification_id), '') IS NOT NULL GROUP BY 1
               UNION ALL
               SELECT TRIM(document_identification_id), MAX(document_identification_name), COUNT(DISTINCT bill_id), 'R'
                 FROM sie_income WHERE empresa_id = $1 AND NULLIF(TRIM(document_identification_id), '') IS NOT NULL GROUP BY 1
               UNION ALL
               SELECT TRIM(document_id), NULL, COUNT(*), 'E'
                 FROM sie_extrato_contas WHERE empresa_id = $1 AND bill_id IS NULL AND NULLIF(TRIM(document_id), '') IS NOT NULL GROUP BY 1) x
        GROUP BY documento
        ORDER BY documento`,
      [empresaId]
    ),
    pool.query('SELECT documento FROM dre_documentos_excluidos WHERE empresa_id = $1 ORDER BY documento', [empresaId]),
  ]);

  const grupos = mascaras
    .filter((m) => m.parent_id === null)
    .map((g) => ({
      id: g.id,
      descricao: g.descricao,
      totalizadora: g.totalizadora,
      filhos: mascaras
        .filter((f) => f.parent_id === g.id)
        .map((f) => ({ id: f.id, descricao: f.descricao, realiza_poc: f.realiza_poc, tipo_poc: f.tipo_poc })),
    }));
  // Tipo excluído que não aparece mais nos lançamentos continua na lista (à direita), pra poder voltar.
  const conhecidos = new Set(documentos.map((d) => d.documento));
  const lista = [
    ...documentos.map((d) => ({ ...d, lancamentos: Number(d.lancamentos) })),
    ...excluidos.filter((x) => !conhecidos.has(x.documento)).map((x) => ({ documento: x.documento, nome: null, lancamentos: 0, origens: '' })),
  ].sort((a, b) => a.documento.localeCompare(b.documento));

  return {
    poc_receita_mascara_id: cfg[0]?.poc_receita_mascara_id ?? null,
    atualizado_em: cfg[0]?.atualizado_em ?? null,
    atualizado_por: cfg[0]?.usuario ?? null,
    mascaras: grupos,
    documentos: lista,
    excluidos: excluidos.map((x) => x.documento),
  };
}

// Máscara obrigatória e de nível 2 da empresa (o controller recusa vazio).
async function salvarPocReceita(empresaId, mascaraId, usuarioId) {
  const { rows } = await pool.query('SELECT parent_id FROM dre_mascaras WHERE id = $1 AND empresa_id = $2', [mascaraId, empresaId]);
  if (!rows[0]) throw erro(400, 'Máscara DRE não encontrada nesta empresa.');
  if (rows[0].parent_id === null) throw erro(400, 'Escolha uma máscara de nível 2.');
  await pool.query(
    `INSERT INTO dre_configuracoes (empresa_id, poc_receita_mascara_id, usuario_id) VALUES ($1, $2, $3)
     ON CONFLICT (empresa_id) DO UPDATE SET poc_receita_mascara_id = EXCLUDED.poc_receita_mascara_id, usuario_id = EXCLUDED.usuario_id`,
    [empresaId, mascaraId, usuarioId]
  );
  return obter(empresaId);
}

// `excluidos`: a lista completa dos tipos fora da DRE (a caixa da direita) — substitui a gravada.
async function salvarDocumentos(empresaId, excluidos, usuarioId) {
  const lista = [...new Set(excluidos.map((d) => String(d).trim()).filter(Boolean))];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dre_documentos_excluidos WHERE empresa_id = $1 AND NOT (documento = ANY($2::text[]))', [empresaId, lista]);
    for (const documento of lista) {
      await client.query(
        `INSERT INTO dre_documentos_excluidos (empresa_id, documento, usuario_id) VALUES ($1, $2, $3)
         ON CONFLICT (empresa_id, documento) DO NOTHING`,
        [empresaId, documento, usuarioId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return obter(empresaId);
}

// Prévia por obra (centros com "Realiza DRE" que têm orçamento ou unidades): orçamento vigente,
// custo acumulado na máscara da POC de Receita, a POC de Receita e a POC de Despesa (fração ideal),
// tudo até hoje.
async function previaPoc(empresaId) {
  const ate = hoje();
  const { rows: cfg } = await pool.query(
    `SELECT c.poc_receita_mascara_id AS id, m.descricao
       FROM dre_configuracoes c LEFT JOIN dre_mascaras m ON m.id = c.poc_receita_mascara_id
      WHERE c.empresa_id = $1`,
    [empresaId]
  );
  const mascara = cfg[0]?.id ? { id: cfg[0].id, descricao: cfg[0].descricao } : null;
  const [{ rows: orcamentos }, { rows: fracoes }, custos] = await Promise.all([
    // Orçamento vigente: o de início mais recente até hoje (mesma regra da aba Orçamento).
    pool.query(
      `SELECT DISTINCT ON (sienge_id) sienge_id AS centro_id, to_char(data_inicio, 'YYYY-MM-DD') AS desde, total
         FROM (SELECT sienge_id, data_inicio, SUM(valor) AS total FROM dre_orcamento_valores
                WHERE empresa_id = $1 AND data_inicio <= $2 GROUP BY 1, 2) o
        ORDER BY sienge_id, data_inicio DESC`,
      [empresaId, ate]
    ),
    // Fração ideal vendida = unidades de contratos ativos (pela participação no contrato) + permutas.
    pool.query(
      `SELECT u.enterprise_id::int AS centro_id, COUNT(*)::int AS unidades,
              COALESCE(SUM(u.ideal_fraction) FILTER (WHERE u.commercial_stock = 'E'), 0) AS permuta,
              COALESCE((SELECT SUM(uu.ideal_fraction * COALESCE(cu.participation_percentage, 100) / 100)
                          FROM sie_sales_contracts k
                          JOIN sie_sales_contracts_units cu ON cu.sienge_contract_id = k.sienge_contract_id AND cu.empresa_id = k.empresa_id
                          JOIN sie_units uu ON uu.sienge_unit_id = cu.unit_id AND uu.empresa_id = k.empresa_id
                         WHERE k.empresa_id = $1 AND k.enterprise_id = u.enterprise_id
                           AND k.situation <> 'Cancelado' AND k.cancellation_date IS NULL AND k.contract_date <= $2), 0) AS vendida
         FROM sie_units u
        WHERE u.empresa_id = $1
        GROUP BY u.enterprise_id`,
      [empresaId, ate]
    ),
    mascara ? financeiro.somaPorCentro(empresaId, mascara.id, ate) : Promise.resolve([]),
  ]);
  const { rows: centros } = await pool.query(
    'SELECT sienge_id::int AS id, name AS nome FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre ORDER BY sienge_id',
    [empresaId]
  );
  const orc = new Map(orcamentos.map((o) => [Number(o.centro_id), o]));
  const fi = new Map(fracoes.map((f) => [f.centro_id, f]));
  const custo = new Map(custos.map((c) => [c.centro_id, c]));
  const obras = centros
    .filter((c) => orc.has(c.id) || fi.has(c.id))
    .map((c) => {
      const o = orc.get(c.id);
      const f = fi.get(c.id);
      const k = custo.get(c.id);
      const orcamento = o ? num(o.total) : null;
      const custoAcumulado = k ? Math.abs(k.valor) : 0;
      const fracao = f ? Math.min(Number(f.vendida) + Number(f.permuta), 1) : null;
      return {
        centro_id: c.id,
        nome: c.nome,
        orcamento,
        orcamento_desde: o?.desde || null,
        custo_acumulado: mascara ? custoAcumulado : null,
        custo_desde: k?.desde || null,
        poc_receita: mascara && orcamento > 0 ? Math.min(custoAcumulado / orcamento, 1) : null,
        poc_despesa: fracao,
        unidades: f?.unidades ?? 0,
        fracao_vendida: f ? Number(f.vendida) : null,
        fracao_permuta: f ? Number(f.permuta) : null,
      };
    });
  return { ate, mascara, obras };
}

module.exports = { obter, salvarPocReceita, salvarDocumentos, previaPoc };
