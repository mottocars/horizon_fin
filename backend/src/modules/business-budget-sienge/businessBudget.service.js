const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { fetchAllBusinessBudget } = require('./businessBudget-api.client');
// (Sincroniza o Orçamento Empresarial do Sienge — mesmo padrão do income/outcome: uma chamada HTTP
// só, apaga e reinsere tudo da empresa numa transação, em lotes multi-linha.)

async function getIntegracaoAtiva(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  return rows[0] || null;
}

// undefined quebraria o driver do Postgres — tudo que vai pro banco passa por aqui.
function v(valor) {
  return valor === undefined ? null : valor;
}

const MAX_PARAMETROS_POR_QUERY = 60000;

function montarPlaceholders(qtdLinhas, qtdColunas) {
  const linhas = [];
  let p = 0;
  for (let i = 0; i < qtdLinhas; i++) {
    const cols = [];
    for (let j = 0; j < qtdColunas; j++) {
      p += 1;
      cols.push(`$${p}`);
    }
    linhas.push(`(${cols.join(',')})`);
  }
  return linhas.join(',');
}

// Insere em lotes (ver income.service.js::inserirEmLotes). Com `retornarId`, devolve os ids
// gerados (coluna `colunaId`) na mesma ordem de `linhas`.
async function inserirEmLotes(client, tabela, colunas, linhas, { retornarId = null } = {}) {
  if (linhas.length === 0) return [];
  const porLote = Math.max(1, Math.floor(MAX_PARAMETROS_POR_QUERY / colunas.length));
  const ids = [];
  for (let inicio = 0; inicio < linhas.length; inicio += porLote) {
    const lote = linhas.slice(inicio, inicio + porLote);
    const sql = `INSERT INTO ${tabela} (${colunas.join(',')}) VALUES ${montarPlaceholders(lote.length, colunas.length)}${
      retornarId ? ` RETURNING ${retornarId}` : ''
    }`;
    const { rows } = await client.query(sql, lote.flat());
    if (retornarId) ids.push(...rows.map((row) => row[retornarId]));
  }
  return ids;
}

const COLUNAS_ORCAMENTO = [
  'empresa_id', 'id', 'start_date', 'end_date', 'base_date', 'description', 'budget_type', 'vision', 'company_id',
  'company_name', 'cost_center_id', 'cost_center_name', 'department_id', 'department_name', 'version_number',
  'version_description', 'api_error',
];
const COLUNAS_CATEGORIA = ['registro_id', 'id', 'description', 'type', 'notes'];
const COLUNAS_VALOR = ['categoria_id', 'month_year', 'mes', 'total_price'];

// "monthYear" -> primeiro dia do mês ('AAAA-MM-01'). A API manda "AAAAMM" (ex.: "202608", visto ao
// vivo); aceita também "MM/AAAA", "MM-AAAA", "AAAA-MM", "AAAA-MM-DD" e "DD/MM/AAAA". Outro formato
// fica null (o texto original continua em month_year).
function mesDe(texto) {
  const s = String(texto ?? '').trim();
  let m = s.match(/^(\d{4})(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}-01`;
  m = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:T.*)?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = s.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}

function linhaOrcamento(empresaId, r) {
  return [
    empresaId, v(r.id), v(r.startDate), v(r.endDate), v(r.baseDate), v(r.description), v(r.budgetType), v(r.vision),
    v(r.companyId), v(r.companyName), v(r.costCenterId), v(r.costCenterName), v(r.departmentId), v(r.departmentName),
    v(r.versionNumber), v(r.versionDescription), v(r['api-error']),
  ];
}

// Substitui inteiro o que estava salvo da empresa pelos `registros` da API (apaga + reinsere numa
// transação só). Pai/filho resolvido por índice de lista, como no income.
async function gravar(empresaId, registros) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sie_business_budget WHERE empresa_id = $1', [empresaId]);

    const idsOrcamentos = await inserirEmLotes(
      client,
      'sie_business_budget',
      COLUNAS_ORCAMENTO,
      registros.map((r) => linhaOrcamento(empresaId, r)),
      { retornarId: 'registro_id' }
    );

    const categoriasBrutas = [];
    registros.forEach((r, i) => {
      for (const cat of r.paymentCategories || []) {
        categoriasBrutas.push({
          linha: [idsOrcamentos[i], v(cat.id), v(cat.description), v(cat.type), v(cat.notes)],
          interval: cat.interval || [],
        });
      }
    });
    const idsCategorias = await inserirEmLotes(
      client,
      'sie_business_budget_categorias',
      COLUNAS_CATEGORIA,
      categoriasBrutas.map((c) => c.linha),
      { retornarId: 'categoria_id' }
    );

    const linhasValores = [];
    categoriasBrutas.forEach((c, i) => {
      for (const it of c.interval) linhasValores.push([idsCategorias[i], v(it.monthYear), mesDe(it.monthYear), v(it.totalPrice)]);
    });
    await inserirEmLotes(client, 'sie_business_budget_valores', COLUNAS_VALOR, linhasValores);

    await client.query('COMMIT');
    return {
      total_importado: registros.length,
      naturezas: categoriasBrutas.length,
      valores: linhasValores.length,
      meses_nao_lidos: linhasValores.filter((l) => l[2] === null).length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Busca tudo da API (uma chamada só) e grava.
async function sincronizar(empresaId, onProgress) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const e = new Error('Esta empresa não possui uma integração com o Sienge ativa configurada.');
    e.status = 400;
    e.expose = true;
    throw e;
  }
  const registros = await fetchAllBusinessBudget({
    tenant: integracao.tenant,
    username: integracao.username,
    password: decrypt(integracao.password_enc),
    onProgress,
  });
  return gravar(empresaId, registros);
}

async function getResumo(empresaId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total_orcamentos, MAX(atualizado_em) AS ultima_sincronizacao
     FROM sie_business_budget WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows[0];
}

module.exports = { sincronizar, gravar, getResumo, mesDe };
