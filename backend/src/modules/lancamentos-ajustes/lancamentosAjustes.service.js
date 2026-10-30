const pool = require('../../config/db');

// Ajustes de lançamentos financeiros do Sienge (tabelas lancamentos_ajustes / _historico —
// database/migrations/2026-10-30-lancamentos-ajustes.sql). O lançamento original nunca é alterado: o
// ajuste é por LINHA DE RATEIO — o lançamento (origem + chave) e o centro × natureza originais
// daquela linha — e guarda o centro, a natureza e o valor que passam a valer no lugar dela. Cada
// gravação ou restauração fica no histórico. Genérico: hoje quem usa é a DRE Gerencial › Financeiro.
//   R  título do contas a receber (sie_income; chave = bill_id), valor líquido (original − impostos);
//   P  título do contas a pagar (sie_outcome; chave = bill_id), valor original, negativo;
//   E  movimento do extrato sem título (sie_extrato_contas; chave = id do lançamento no Sienge), com o
//      sinal do extrato.
// Linha da origem R/P = as parcelas do título somadas, rateadas pelo percentual de cada categoria
// dividido pela soma da parcela (a mesma regra da listagem do Financeiro).
// Lançamento do ano atual (emissão do título ou data do movimento) ou de ano futuro não pode ser
// ajustado: é o exercício em andamento, travado, só visualização (pedido do usuário) — a regra vale
// aqui, no backend, não só na tela.

const TITULOS = {
  R: { tabela: 'sie_income', categorias: 'sie_income_categorias', contraparte: 'client_name', valor: 't.original_amount - COALESCE(t.tax_amount, 0)', sinal: 1 },
  P: { tabela: 'sie_outcome', categorias: 'sie_outcome_categorias', contraparte: 'creditor_name', valor: 't.original_amount', sinal: -1 },
};

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;
const mesmo = (a, b) => (a === null || a === undefined || a === '' ? null : String(a)) === (b === null || b === undefined || b === '' ? null : String(b));

// Cabeçalho e linhas (centro × natureza, valor com sinal) do lançamento original.
async function original(db, empresaId, origem, chave) {
  if (origem === 'E') {
    const { rows: cab } = await db.query(
      `SELECT to_char(e.date, 'YYYY-MM-DD') AS data, NULLIF(TRIM(e.document_id), '') AS documento,
              e.statement_type_notes AS documento_nome, e.document_number AS numero,
              NULLIF(BTRIM(e.description, E' \\t\\r\\n'), '') AS contraparte, e.numero_conta, e.registro_id
         FROM sie_extrato_contas e
        WHERE e.empresa_id = $1 AND e.id = $2 AND e.bill_id IS NULL`,
      [empresaId, chave]
    );
    if (!cab[0]) return null;
    const { rows: linhas } = await db.query(
      `SELECT r.centro_id, r.natureza_id::text AS natureza_id, ROUND(SUM(r.valor), 2) AS valor
         FROM sie_extrato_contas_rateio r
        WHERE r.empresa_id = $1 AND r.registro_id = $2
        GROUP BY 1, 2`,
      [empresaId, cab[0].registro_id]
    );
    const { registro_id: _r, ...cabecalho } = cab[0];
    return { cabecalho: { ...cabecalho, parcelas: null }, linhas };
  }
  const t = TITULOS[origem];
  const { rows: cab } = await db.query(
    `SELECT to_char(MIN(t.issue_date), 'YYYY-MM-DD') AS data, COUNT(*)::int AS parcelas,
            to_char(MIN(t.due_date), 'YYYY-MM-DD') AS vencimento, to_char(MAX(t.due_date), 'YYYY-MM-DD') AS vencimento_ate,
            MAX(NULLIF(TRIM(t.document_identification_id), '')) AS documento, MAX(t.document_identification_name) AS documento_nome,
            MAX(t.document_number) AS numero, MAX(t.${t.contraparte}) AS contraparte
       FROM ${t.tabela} t
      WHERE t.empresa_id = $1 AND t.bill_id = $2`,
    [empresaId, chave]
  );
  if (!cab[0] || !cab[0].parcelas) return null;
  const { rows: linhas } = await db.query(
    `SELECT c.centro_id, c.natureza_id, ROUND(SUM((${t.valor}) * COALESCE(c.peso, 1)) * ${t.sinal}, 2) AS valor
       FROM ${t.tabela} t
       LEFT JOIN LATERAL (
         SELECT cost_center_id::int AS centro_id, NULLIF(TRIM(financial_category_id), '') AS natureza_id,
                COALESCE(SUM(financial_category_rate) / NULLIF(SUM(SUM(financial_category_rate)) OVER (), 0),
                         1.0 / COUNT(*) OVER ()) AS peso
           FROM ${t.categorias} k
          WHERE k.bill_id = t.bill_id AND k.installment_id = t.installment_id AND k.empresa_id = t.empresa_id
          GROUP BY cost_center_id, NULLIF(TRIM(financial_category_id), '')
       ) c ON TRUE
      WHERE t.empresa_id = $1 AND t.bill_id = $2
      GROUP BY 1, 2`,
    [empresaId, chave]
  );
  return { cabecalho: cab[0], linhas };
}

async function ajusteDa(db, empresaId, origem, chave, centroOriginal, naturezaOriginal) {
  const { rows } = await db.query(
    `SELECT a.id, a.centro_id, a.natureza_id, a.valor, a.observacao, a.atualizado_em, u.nome AS usuario
       FROM lancamentos_ajustes a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.empresa_id = $1 AND a.origem = $2 AND a.chave = $3
        AND a.centro_original IS NOT DISTINCT FROM $4::int AND a.natureza_original IS NOT DISTINCT FROM $5::varchar`,
    [empresaId, origem, chave, centroOriginal, naturezaOriginal]
  );
  return rows[0] ? { ...rows[0], valor: num(rows[0].valor) } : null;
}

// Exercício em andamento ou futuro (pelo relógio da aplicação — o do Postgres da VPS é deslocado).
const travadoPela = (data) => Boolean(data) && Number(data.slice(0, 4)) >= new Date().getFullYear();

async function nomes(empresaId) {
  const [{ rows: centros }, { rows: naturezas }] = await Promise.all([
    pool.query('SELECT sienge_id AS id, name AS nome FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY sienge_id', [empresaId]),
    pool.query(
      `SELECT sienge_id::text AS id, name AS nome, tp_conta <> 'T' AS analitica FROM planos_financeiros_sienge
        WHERE empresa_id = $1 ORDER BY sienge_id::text`,
      [empresaId]
    ),
  ]);
  return { centros, naturezas };
}

// O lançamento original e a linha de rateio pedida; 404 se não existir.
async function carregarLinha(db, empresaId, origem, chave, centroOriginal, naturezaOriginal) {
  const o = await original(db, empresaId, origem, chave);
  if (!o) throw erro(404, origem === 'E' ? 'Movimento não encontrado nesta empresa.' : 'Título não encontrado nesta empresa.');
  const linha = o.linhas.find((l) => mesmo(l.centro_id, centroOriginal) && mesmo(l.natureza_id, naturezaOriginal));
  if (!linha) throw erro(404, 'Esta linha de rateio não existe mais no lançamento (o Sienge pode ter mudado o rateio).');
  return { o, linha };
}

// Tudo o que a janela do lançamento mostra: o lançamento, a linha de rateio original (centro,
// natureza, valor e % do rateio), o ajuste dela (se houver), o histórico da linha e as opções de
// centro e natureza.
async function obter(empresaId, origem, chave, centroOriginal, naturezaOriginal) {
  const { o, linha } = await carregarLinha(pool, empresaId, origem, chave, centroOriginal, naturezaOriginal);
  const [ajuste, { rows: historico }, opcoes] = await Promise.all([
    ajusteDa(pool, empresaId, origem, chave, centroOriginal, naturezaOriginal),
    pool.query(
      `SELECT h.acao, h.antes, h.depois, h.criado_em, u.nome AS usuario
         FROM lancamentos_ajustes_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.empresa_id = $1 AND h.origem = $2 AND h.chave = $3
          AND h.centro_original IS NOT DISTINCT FROM $4::int AND h.natureza_original IS NOT DISTINCT FROM $5::varchar
        ORDER BY h.criado_em DESC, h.id DESC LIMIT 30`,
      [empresaId, origem, chave, centroOriginal, naturezaOriginal]
    ),
    nomes(empresaId),
  ]);
  const centro = new Map(opcoes.centros.map((c) => [String(c.id), c.nome]));
  const natureza = new Map(opcoes.naturezas.map((n) => [n.id, n.nome]));
  const total = o.linhas.reduce((s, l) => s + Number(l.valor), 0);
  const valor = Number(linha.valor);
  const comNomes = (x) =>
    x && { ...x, centro_nome: centro.get(String(x.centro_id)) || null, natureza_nome: natureza.get(String(x.natureza_id)) || null };
  return {
    origem,
    chave,
    ...o.cabecalho,
    valor_lancamento: r2(total),
    travado: travadoPela(o.cabecalho.data),
    linha: comNomes({
      centro_id: linha.centro_id,
      natureza_id: linha.natureza_id,
      valor,
      percentual: total ? (valor / total) * 100 : null,
    }),
    ajuste: comNomes(ajuste),
    historico,
    opcoes: { centros: opcoes.centros, naturezas: opcoes.naturezas.filter((n) => n.analitica).map(({ id, nome }) => ({ id, nome })) },
  };
}

// Grava o ajuste da linha: centro, natureza (conta analítica do plano) e valor (positivo — o sinal é o
// da linha original).
async function salvar(empresaId, origem, chave, centroOriginal, naturezaOriginal, { centro_id: centroId, natureza_id: naturezaId, valor, observacao }, usuarioId) {
  const { o } = await carregarLinha(pool, empresaId, origem, chave, centroOriginal, naturezaOriginal);
  if (travadoPela(o.cabecalho.data)) {
    throw erro(403, 'Lançamento do exercício em andamento: só pode ser visualizado, não pode ser ajustado.');
  }
  const { rows: cc } = await pool.query('SELECT 1 FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, centroId]);
  if (!cc[0]) throw erro(400, 'Centro de custo não encontrado nesta empresa.');
  const { rows: nat } = await pool.query(
    "SELECT 1 FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id::text = $2 AND tp_conta <> 'T'",
    [empresaId, String(naturezaId)]
  );
  if (!nat[0]) throw erro(400, 'Natureza não encontrada no plano de contas (só contas analíticas).');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const antes = await ajusteDa(client, empresaId, origem, chave, centroOriginal, naturezaOriginal);
    await client.query(
      `INSERT INTO lancamentos_ajustes (empresa_id, origem, chave, centro_original, natureza_original, centro_id, natureza_id, valor, observacao, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (empresa_id, origem, chave, COALESCE(centro_original, -1), COALESCE(natureza_original, ''))
       DO UPDATE SET centro_id = EXCLUDED.centro_id, natureza_id = EXCLUDED.natureza_id, valor = EXCLUDED.valor,
                     observacao = EXCLUDED.observacao, usuario_id = EXCLUDED.usuario_id`,
      [empresaId, origem, chave, centroOriginal, naturezaOriginal, centroId, String(naturezaId), r2(valor), observacao || null, usuarioId]
    );
    const resumo = (a) => a && { centro_id: a.centro_id, natureza_id: a.natureza_id, valor: num(a.valor), observacao: a.observacao || null };
    await client.query(
      `INSERT INTO lancamentos_ajustes_historico (empresa_id, origem, chave, centro_original, natureza_original, acao, antes, depois, usuario_id)
       VALUES ($1, $2, $3, $4, $5, 'AJUSTOU', $6, $7, $8)`,
      [empresaId, origem, chave, centroOriginal, naturezaOriginal, resumo(antes),
        resumo({ centro_id: centroId, natureza_id: String(naturezaId), valor: r2(valor), observacao }), usuarioId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return obter(empresaId, origem, chave, centroOriginal, naturezaOriginal);
}

// Volta a linha ao original do Sienge (apaga o ajuste; o histórico guarda o que era).
async function restaurar(empresaId, origem, chave, centroOriginal, naturezaOriginal, usuarioId) {
  const { o } = await carregarLinha(pool, empresaId, origem, chave, centroOriginal, naturezaOriginal);
  if (travadoPela(o.cabecalho.data)) {
    throw erro(403, 'Lançamento do exercício em andamento: só pode ser visualizado, não pode ser ajustado.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const antes = await ajusteDa(client, empresaId, origem, chave, centroOriginal, naturezaOriginal);
    if (antes) {
      await client.query('DELETE FROM lancamentos_ajustes WHERE id = $1', [antes.id]);
      await client.query(
        `INSERT INTO lancamentos_ajustes_historico (empresa_id, origem, chave, centro_original, natureza_original, acao, antes, depois, usuario_id)
         VALUES ($1, $2, $3, $4, $5, 'RESTAUROU', $6, NULL, $7)`,
        [empresaId, origem, chave, centroOriginal, naturezaOriginal,
          { centro_id: antes.centro_id, natureza_id: antes.natureza_id, valor: antes.valor, observacao: antes.observacao || null }, usuarioId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return obter(empresaId, origem, chave, centroOriginal, naturezaOriginal);
}

module.exports = { obter, salvar, restaurar };
