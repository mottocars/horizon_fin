const pool = require('../../config/db');

// Ajustes de títulos do contas a receber (R, sie_income) e a pagar (P, sie_outcome) — tabelas
// titulos_ajustes / _rateio / _historico (database/migrations/2026-10-30-titulos-ajustes.sql). O
// título do Sienge nunca é alterado: o ajuste guarda as linhas (centro de custo × natureza × valor)
// que SUBSTITUEM o rateio original do título inteiro (todas as parcelas), e cada gravação ou
// restauração fica no histórico. Genérico: hoje quem usa é a DRE Gerencial › Financeiro.
// Título emitido no ano atual não pode ser ajustado: é o exercício em andamento, travado, só
// visualização (pedido do usuário) — a regra vale aqui, no backend, não só na tela. Emissão em ano
// futuro (data digitada à frente no Sienge) também fica travada: ainda nem é exercício.

const TABELAS = {
  R: { titulos: 'sie_income', categorias: 'sie_income_categorias', contraparte: 'client_name', parcela: 'installment_number::text', valor: 't.original_amount - COALESCE(t.tax_amount, 0)' },
  P: { titulos: 'sie_outcome', categorias: 'sie_outcome_categorias', contraparte: 'creditor_name', parcela: 'installment_id::text', valor: 't.original_amount' },
};

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;

// Parcelas do título (com o valor de cada uma, do jeito que o título vale).
async function parcelasDo(db, empresaId, origem, billId) {
  const t = TABELAS[origem];
  const { rows } = await db.query(
    `SELECT t.installment_id, ${t.parcela} AS parcela, to_char(t.issue_date, 'YYYY-MM-DD') AS emissao,
            to_char(t.due_date, 'YYYY-MM-DD') AS vencimento, ${t.valor} AS valor, t.balance_amount AS saldo,
            NULLIF(TRIM(t.document_identification_id), '') AS documento, t.document_identification_name AS documento_nome,
            t.document_number AS numero, t.${t.contraparte} AS contraparte
       FROM ${t.titulos} t
      WHERE t.empresa_id = $1 AND t.bill_id = $2
      ORDER BY t.due_date, t.installment_id`,
    [empresaId, billId]
  );
  return rows;
}

// Rateio original do título (Sienge): por centro × natureza, somando as parcelas — o percentual de
// cada categoria dividido pela soma da parcela (mesma regra da listagem do Financeiro).
async function rateioOriginal(db, empresaId, origem, billId) {
  const t = TABELAS[origem];
  const { rows } = await db.query(
    `SELECT c.centro_id, COALESCE(cc.name, MAX(c.centro_nome)) AS centro_nome,
            c.natureza_id, COALESCE(pf.name, MAX(c.natureza_nome)) AS natureza_nome,
            ROUND(SUM((${t.valor}) * COALESCE(c.peso, 1)), 2) AS valor
       FROM ${t.titulos} t
       LEFT JOIN LATERAL (
         SELECT cost_center_id::int AS centro_id, MAX(cost_center_name) AS centro_nome,
                NULLIF(TRIM(financial_category_id), '') AS natureza_id, MAX(financial_category_name) AS natureza_nome,
                COALESCE(SUM(financial_category_rate) / NULLIF(SUM(SUM(financial_category_rate)) OVER (), 0),
                         1.0 / COUNT(*) OVER ()) AS peso
           FROM ${t.categorias} k
          WHERE k.bill_id = t.bill_id AND k.installment_id = t.installment_id AND k.empresa_id = t.empresa_id
          GROUP BY cost_center_id, NULLIF(TRIM(financial_category_id), '')
       ) c ON TRUE
       LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = t.empresa_id AND cc.sienge_id = c.centro_id
       LEFT JOIN planos_financeiros_sienge pf ON pf.empresa_id = t.empresa_id AND pf.sienge_id::text = c.natureza_id
      WHERE t.empresa_id = $1 AND t.bill_id = $2
      GROUP BY c.centro_id, cc.name, c.natureza_id, pf.name
      ORDER BY valor DESC`,
    [empresaId, billId]
  );
  return rows.map((r) => ({ ...r, valor: num(r.valor) }));
}

async function ajusteDo(db, empresaId, origem, billId) {
  const { rows } = await db.query(
    `SELECT a.id, a.observacao, a.atualizado_em, u.nome AS usuario
       FROM titulos_ajustes a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.empresa_id = $1 AND a.origem = $2 AND a.bill_id = $3`,
    [empresaId, origem, billId]
  );
  if (!rows[0]) return null;
  const { rows: linhas } = await db.query(
    `SELECT r.centro_id, cc.name AS centro_nome, r.natureza_id, pf.name AS natureza_nome, r.valor
       FROM titulos_ajustes_rateio r
       LEFT JOIN centros_custo_sienge cc ON cc.empresa_id = $2 AND cc.sienge_id = r.centro_id
       LEFT JOIN planos_financeiros_sienge pf ON pf.empresa_id = $2 AND pf.sienge_id::text = r.natureza_id
      WHERE r.ajuste_id = $1
      ORDER BY r.id`,
    [rows[0].id, empresaId]
  );
  return { ...rows[0], linhas: linhas.map((l) => ({ ...l, valor: num(l.valor) })) };
}

// Exercício em andamento ou futuro (emissão no ano atual ou depois, pelo relógio da aplicação — o do
// Postgres da VPS é deslocado): só visualização.
function travadoPelaEmissao(parcelas) {
  const emissao = parcelas.map((p) => p.emissao).filter(Boolean).sort()[0];
  return Boolean(emissao) && Number(emissao.slice(0, 4)) >= new Date().getFullYear();
}

// Tudo o que a janela do título mostra: cabeçalho, parcelas, rateio original, ajuste (se houver),
// histórico e as opções de centro e natureza pra editar.
async function obter(empresaId, origem, billId) {
  const parcelas = await parcelasDo(pool, empresaId, origem, billId);
  if (!parcelas.length) throw erro(404, 'Título não encontrado nesta empresa.');
  const [original, ajuste, { rows: historico }, { rows: centros }, { rows: naturezas }] = await Promise.all([
    rateioOriginal(pool, empresaId, origem, billId),
    ajusteDo(pool, empresaId, origem, billId),
    pool.query(
      `SELECT h.acao, h.antes, h.depois, h.criado_em, u.nome AS usuario
         FROM titulos_ajustes_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.empresa_id = $1 AND h.origem = $2 AND h.bill_id = $3
        ORDER BY h.criado_em DESC, h.id DESC LIMIT 30`,
      [empresaId, origem, billId]
    ),
    pool.query('SELECT sienge_id AS id, name AS nome FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY sienge_id', [empresaId]),
    pool.query(
      `SELECT sienge_id::text AS id, name AS nome FROM planos_financeiros_sienge
        WHERE empresa_id = $1 AND tp_conta <> 'T' ORDER BY sienge_id::text`,
      [empresaId]
    ),
  ]);
  const p0 = parcelas[0];
  return {
    origem,
    titulo: billId,
    documento: p0.documento,
    documento_nome: p0.documento_nome,
    numero: p0.numero,
    contraparte: p0.contraparte,
    emissao: parcelas.map((p) => p.emissao).filter(Boolean).sort()[0] || null,
    valor_original: r2(parcelas.reduce((s, p) => s + num(p.valor), 0)),
    travado: travadoPelaEmissao(parcelas),
    parcelas: parcelas.map((p) => ({ parcela: p.parcela, emissao: p.emissao, vencimento: p.vencimento, valor: num(p.valor), saldo: num(p.saldo) })),
    original,
    ajuste,
    historico,
    opcoes: { centros, naturezas },
  };
}

// Grava o ajuste do título: as linhas (centro, natureza, valor > 0) substituem o rateio original.
// Centro e natureza têm de existir na empresa (natureza: conta analítica do plano).
async function salvar(empresaId, origem, billId, { linhas, observacao }, usuarioId) {
  const parcelas = await parcelasDo(pool, empresaId, origem, billId);
  if (!parcelas.length) throw erro(404, 'Título não encontrado nesta empresa.');
  if (travadoPelaEmissao(parcelas)) {
    throw erro(403, 'Título do exercício em andamento: só pode ser visualizado, não pode ser ajustado.');
  }
  const centros = [...new Set(linhas.map((l) => l.centro_id))];
  const naturezas = [...new Set(linhas.map((l) => l.natureza_id))];
  const { rows: cc } = await pool.query('SELECT sienge_id FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])', [
    empresaId,
    centros,
  ]);
  if (cc.length !== centros.length) throw erro(400, 'Centro de custo não encontrado nesta empresa.');
  const { rows: nat } = await pool.query(
    `SELECT sienge_id::text AS id FROM planos_financeiros_sienge
      WHERE empresa_id = $1 AND sienge_id::text = ANY($2::text[]) AND tp_conta <> 'T'`,
    [empresaId, naturezas]
  );
  if (nat.length !== naturezas.length) throw erro(400, 'Natureza não encontrada no plano de contas (só contas analíticas).');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const antes = await ajusteDo(client, empresaId, origem, billId);
    const { rows } = await client.query(
      `INSERT INTO titulos_ajustes (empresa_id, origem, bill_id, observacao, usuario_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (empresa_id, origem, bill_id) DO UPDATE SET observacao = EXCLUDED.observacao, usuario_id = EXCLUDED.usuario_id
       RETURNING id`,
      [empresaId, origem, billId, observacao || null, usuarioId]
    );
    const ajusteId = rows[0].id;
    await client.query('DELETE FROM titulos_ajustes_rateio WHERE ajuste_id = $1', [ajusteId]);
    for (const l of linhas) {
      await client.query('INSERT INTO titulos_ajustes_rateio (ajuste_id, centro_id, natureza_id, valor) VALUES ($1, $2, $3, $4)', [
        ajusteId,
        l.centro_id,
        String(l.natureza_id),
        r2(l.valor),
      ]);
    }
    const depois = await ajusteDo(client, empresaId, origem, billId);
    const resumo = (a) => (a ? { observacao: a.observacao, linhas: a.linhas.map(({ centro_id, natureza_id, valor }) => ({ centro_id, natureza_id, valor })) } : null);
    await client.query(
      `INSERT INTO titulos_ajustes_historico (empresa_id, origem, bill_id, acao, antes, depois, usuario_id)
       VALUES ($1, $2, $3, 'AJUSTOU', $4, $5, $6)`,
      [empresaId, origem, billId, resumo(antes), resumo(depois), usuarioId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return obter(empresaId, origem, billId);
}

// Volta o título ao original do Sienge (apaga o ajuste; o histórico guarda o que era).
async function restaurar(empresaId, origem, billId, usuarioId) {
  const parcelas = await parcelasDo(pool, empresaId, origem, billId);
  if (!parcelas.length) throw erro(404, 'Título não encontrado nesta empresa.');
  if (travadoPelaEmissao(parcelas)) {
    throw erro(403, 'Título do exercício em andamento: só pode ser visualizado, não pode ser ajustado.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const antes = await ajusteDo(client, empresaId, origem, billId);
    if (antes) {
      await client.query('DELETE FROM titulos_ajustes WHERE id = $1', [antes.id]);
      await client.query(
        `INSERT INTO titulos_ajustes_historico (empresa_id, origem, bill_id, acao, antes, depois, usuario_id)
         VALUES ($1, $2, $3, 'RESTAUROU', $4, NULL, $5)`,
        [
          empresaId,
          origem,
          billId,
          { observacao: antes.observacao, linhas: antes.linhas.map(({ centro_id, natureza_id, valor }) => ({ centro_id, natureza_id, valor })) },
          usuarioId,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return obter(empresaId, origem, billId);
}

module.exports = { obter, salvar, restaurar };
