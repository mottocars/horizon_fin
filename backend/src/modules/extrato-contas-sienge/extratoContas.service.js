const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { fetchAllStatements, inicioDoMesAtual } = require('./extratoContas-api.client');

// Sincroniza o extrato (v1/accounts-statements) de TODAS as contas da empresa (aba Contas Correntes do
// DFC Construtoras), conta a conta: busca a base completa da conta (01/01/2000 até o início do mês
// atual) e substitui a que estava gravada pra ela, numa transação por conta. Só as contas com
// "Projeta DFC" somam no fluxo de caixa e nos saldos (dfc-saldos filtra); as demais estão aqui pra
// herança da natureza — no mútuo, a perna com a natureza fica na conta de mútuo (pedido do usuário).

async function getIntegracaoAtiva(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  return rows[0] || null;
}

const v = (valor) => (valor === undefined ? null : valor);
const MAX_PARAMETROS_POR_QUERY = 60000;

const COLUNAS = [
  'empresa_id', 'company_id', 'numero_conta', 'id', 'value', 'date', 'document_number', 'description', 'document_id',
  'type', 'reconciliation_date', 'bill_id', 'installment_number', 'statement_origin', 'statement_type',
  'statement_type_notes', 'budget_categories',
];

function linha(empresaId, conta, r) {
  return [
    empresaId, conta.company_id, conta.numero_conta, v(r.id), v(r.value), v(r.date) || null, v(r.documentNumber),
    v(r.description), v(r.documentId), v(r.type), v(r.reconciliationDate) || null, v(r.billId), v(r.installmentNumber),
    v(r.statementOrigin), v(r.statementType), v(r.statementTypeNotes),
    r.budgetCategories === undefined ? null : JSON.stringify(r.budgetCategories),
  ];
}

// Grava os lançamentos de UMA conta (apaga os anteriores dela e reinsere, em lotes).
async function gravarConta(empresaId, conta, lancamentos, dataAte) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sie_extrato_contas WHERE empresa_id = $1 AND company_id = $2 AND numero_conta = $3', [
      empresaId,
      conta.company_id,
      conta.numero_conta,
    ]);
    const linhas = lancamentos.map((r) => linha(empresaId, conta, r));
    const porLote = Math.floor(MAX_PARAMETROS_POR_QUERY / COLUNAS.length);
    for (let i = 0; i < linhas.length; i += porLote) {
      const lote = linhas.slice(i, i + porLote);
      let p = 0;
      const valores = lote.map(() => `(${COLUNAS.map(() => `$${++p}`).join(',')})`).join(',');
      await client.query(`INSERT INTO sie_extrato_contas (${COLUNAS.join(',')}) VALUES ${valores}`, lote.flat());
    }
    await client.query(
      `INSERT INTO sie_extrato_contas_sincronizacoes (empresa_id, company_id, numero_conta, data_ate, lancamentos, sincronizado_em)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (empresa_id, company_id, numero_conta) DO UPDATE SET
         data_ate = EXCLUDED.data_ate, lancamentos = EXCLUDED.lancamentos, sincronizado_em = EXCLUDED.sincronizado_em`,
      [empresaId, conta.company_id, conta.numero_conta, dataAte, lancamentos.length, new Date()]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Monta o extrato achatado por rateio (sie_extrato_contas_rateio) da empresa inteira — base do
// REALIZADO do fluxo de caixa. Mesma regra da query do usuário:
// - uma linha por categoria do lançamento (budget_categories): percentual, centro de custo e natureza
//   tirados do fim dos links "cost-center" e "payment-categories";
// - lançamento sem categoria entra com 100% (centro e natureza nulos);
// - lançamento de título (bill_id) sem centro/natureza herda o de outro lançamento do mesmo título na
//   mesma data — partição por título + data, exatamente como a query do usuário (no mútuo, a natureza
//   está na outra perna, que fica em outra conta/empresa);
// - valor com sinal (Expense negativo), com 6 casas pra a soma das partes bater com o lançamento.
// Roda uma vez por sincronização (não a cada abertura da tela) — a tela só soma.
async function montarRateio(empresaId, db = pool) {
  await db.query('DELETE FROM sie_extrato_contas_rateio WHERE empresa_id = $1', [empresaId]);
  const { rowCount } = await db.query(
    `WITH categorias AS (
       SELECT e.registro_id, e.empresa_id, e.company_id, e.numero_conta, e.date, e.bill_id, e.statement_origin,
              CASE WHEN e.type = 'Expense' THEN -1 ELSE 1 END AS sinal, COALESCE(e.value, 0) AS value, c.cat
         FROM sie_extrato_contas e
         LEFT JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(e.budget_categories) = 'array' THEN e.budget_categories ELSE '[]'::jsonb END
              ) AS c(cat) ON TRUE
        WHERE e.empresa_id = $1
     ),
     base AS (
       SELECT categorias.*,
              COALESCE((cat->>'percentage')::numeric, 100) AS pct,
              (SELECT NULLIF(regexp_replace(l->>'href', '^.*/', ''), '')
                 FROM jsonb_array_elements(COALESCE(cat->'links', '[]'::jsonb)) l
                WHERE l->>'rel' = 'cost-center' LIMIT 1) AS centro_txt,
              (SELECT NULLIF(regexp_replace(l->>'href', '^.*/', ''), '')
                 FROM jsonb_array_elements(COALESCE(cat->'links', '[]'::jsonb)) l
                WHERE l->>'rel' = 'payment-categories' LIMIT 1) AS natureza_txt
         FROM categorias
     ),
     tipado AS (
       SELECT base.*,
              CASE WHEN centro_txt ~ '^[0-9]+$' THEN centro_txt::int END AS centro,
              CASE WHEN natureza_txt ~ '^[0-9]+$' THEN natureza_txt::int END AS natureza
         FROM base
     )
     INSERT INTO sie_extrato_contas_rateio
       (empresa_id, registro_id, company_id, numero_conta, data, mes, centro_id, natureza_id, percentual, valor)
     SELECT empresa_id, registro_id, company_id, numero_conta, date, date_trunc('month', date)::date,
            CASE WHEN bill_id IS NOT NULL
                 THEN COALESCE(centro, MAX(centro) OVER (PARTITION BY bill_id, date))
                 ELSE centro END,
            CASE WHEN bill_id IS NOT NULL
                 THEN COALESCE(natureza, MAX(natureza) OVER (PARTITION BY bill_id, date))
                 ELSE natureza END,
            pct,
            sinal * value * pct / 100
       FROM tipado
      WHERE date IS NOT NULL`,
    [empresaId]
  );
  return rowCount;
}

// Todas as contas da empresa, uma a uma (precisa de ao menos uma com "Projeta DFC" — senão não há
// fluxo pra montar). `onProgress({ texto, paginaAtual, totalPaginas })`.
// Uma conta que o Sienge não devolve (mesmo depois das novas tentativas do siengeFetch) não derruba as
// outras: ela mantém o extrato que já estava gravado e volta em `falhas` ({ numero_conta, nome,
// projeta_dfc, erro }) — quem chama decide se é erro (conta com Projeta DFC) ou só aviso.
async function sincronizar(empresaId, onProgress) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const e = new Error('Esta empresa não possui uma integração com o Sienge ativa configurada.');
    e.status = 400;
    e.expose = true;
    throw e;
  }
  const { rows: contas } = await pool.query(
    `SELECT company_id, numero_conta, nome, projeta_dfc FROM contas_bancarias_sienge
      WHERE empresa_id = $1 ORDER BY projeta_dfc DESC, company_id, numero_conta`,
    [empresaId]
  );
  if (!contas.some((c) => c.projeta_dfc)) {
    const e = new Error('Nenhuma conta com "Projeta DFC" marcado (DFC Construtoras > Contas Correntes).');
    e.status = 400;
    e.expose = true;
    throw e;
  }
  const credenciais = { tenant: integracao.tenant, username: integracao.username, password: decrypt(integracao.password_enc) };
  const endDate = inicioDoMesAtual();
  let lancamentos = 0;
  const falhas = [];
  for (let i = 0; i < contas.length; i += 1) {
    const conta = contas[i];
    const texto = `Conta ${i + 1} de ${contas.length}: ${conta.numero_conta}${conta.nome ? ` · ${conta.nome}` : ''}`;
    onProgress?.({ texto });
    let lista;
    try {
      lista = await fetchAllStatements({
        ...credenciais,
        accountNumber: conta.numero_conta,
        companyId: conta.company_id,
        endDate,
        onPagina: (pagina, total) => onProgress?.({ texto, paginaAtual: pagina, totalPaginas: total }),
      });
    } catch (err) {
      // Erro do Sienge nesta conta (status da API): segue com as demais. Erro nosso (banco etc.) para tudo.
      if (err.status !== 502) throw err;
      falhas.push({ numero_conta: conta.numero_conta, nome: conta.nome, projeta_dfc: conta.projeta_dfc, erro: err.message });
      continue;
    }
    await gravarConta(empresaId, conta, lista, endDate);
    lancamentos += lista.length;
  }
  onProgress?.({ texto: 'Classificando os lançamentos por centro de custo e natureza' });
  await montarRateio(empresaId);
  return { contas: contas.length, lancamentos, ate: endDate, falhas };
}

module.exports = { sincronizar, gravarConta, montarRateio };
