const A = require('./anonimizador');
const C = require('./config');

// ---------------------------------------------------------------------------------------
// Auditoria da empresa modelo: varre TODO texto (varchar/text/jsonb) das tabelas da empresa
// modelo e acusa (1) palavras proibidas (TOSTE, DINIZ, GENESIS…), (2) CPF/CNPJ reais da
// origem e (3) nomes reais de pessoas da origem. Lista vazia = nada identifica a origem.
// ---------------------------------------------------------------------------------------

// Filhas sem empresa_id: como chegar nas linhas da empresa modelo.
const FILHAS = {
  sie_income_recebimentos_movimentos: 'recebimento_id IN (SELECT id FROM sie_income_recebimentos WHERE empresa_id = $1)',
  sie_income_recebimentos_movimentos_categorias:
    'movimento_id IN (SELECT m.id FROM sie_income_recebimentos_movimentos m JOIN sie_income_recebimentos r ON r.id = m.recebimento_id WHERE r.empresa_id = $1)',
  sie_outcome_pagamentos_movimentos: 'pagamento_id IN (SELECT id FROM sie_outcome_pagamentos WHERE empresa_id = $1)',
  sie_outcome_pagamentos_movimentos_categorias:
    'movimento_id IN (SELECT m.id FROM sie_outcome_pagamentos_movimentos m JOIN sie_outcome_pagamentos p ON p.id = m.pagamento_id WHERE p.empresa_id = $1)',
  sie_business_budget_categorias: 'registro_id IN (SELECT registro_id FROM sie_business_budget WHERE empresa_id = $1)',
  espiao_notas_eventos: 'nota_id IN (SELECT id FROM espiao_notas WHERE empresa_id = $1)',
  projetos_macros: 'plano_id IN (SELECT id FROM projetos_planos WHERE empresa_id = $1)',
  projetos_comentarios: 'card_id IN (SELECT id FROM projetos_cards WHERE empresa_id = $1)',
  projetos_historico: 'card_id IN (SELECT id FROM projetos_cards WHERE empresa_id = $1)',
  integracoes_vanpix_convenios: 'integracao_id IN (SELECT id FROM integracoes_vanpix WHERE empresa_id = $1)',
  regua_cobranca_historico_anexos: 'registro_id IN (SELECT id FROM regua_cobranca_historico_registros WHERE empresa_id = $1)',
};

async function nomesReaisDaOrigem(client, origem) {
  const { rows } = await client.query(
    `SELECT name AS n FROM sie_customers WHERE empresa_id = $1
     UNION SELECT name FROM sie_customers_spouse WHERE empresa_id = $1
     UNION SELECT nome_mutuario FROM extrato_unidades WHERE empresa_id = $1
     UNION SELECT creditor_name FROM sie_outcome WHERE empresa_id = $1
     UNION SELECT registered_by FROM sie_outcome WHERE empresa_id = $1
     UNION SELECT emissor FROM espiao_notas WHERE empresa_id = $1
     UNION SELECT nome FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id = u.id WHERE ue.empresa_id = $1`,
    [origem]
  );
  const nomes = new Set();
  for (const { n } of rows) {
    const t = A.normalizar(String(n || '').replace(/^\d[\d.]*\s+/, ''));
    if (t.split(' ').length >= 2 && !/^(CAIXA|BANCO|PREFEITURA|RECEITA|MUNICIPIO|MINISTERIO|SECRETARIA)/.test(t) && A.nome(t) !== t) nomes.add(t);
  }
  return nomes;
}

async function documentosReaisDaOrigem(client, origem) {
  const { rows } = await client.query(
    `SELECT cpf AS d FROM sie_customers WHERE empresa_id = $1 UNION SELECT cnpj FROM sie_customers WHERE empresa_id = $1
     UNION SELECT cpf FROM sie_customers_spouse WHERE empresa_id = $1
     UNION SELECT cnpj FROM centros_custo_sienge WHERE empresa_id = $1
     UNION SELECT cnpj_emitente FROM espiao_notas WHERE empresa_id = $1
     UNION SELECT cnpj_destinatario FROM espiao_notas WHERE empresa_id = $1
     UNION SELECT cpf_cnpj_mutuario FROM extrato_unidades WHERE empresa_id = $1
     UNION SELECT cnpj FROM empresas WHERE id = $1`,
    [origem]
  );
  const docs = new Set();
  for (const { d } of rows) {
    const dig = A.soDigitos(d).replace(/^0+(?=\d{11}$)/, '');
    if (dig.length >= 11 && !/^0+$/.test(dig)) docs.add(dig);
  }
  return docs;
}

async function auditar(client, modelo, { log = () => {}, origemCnpj = C.CNPJ_ORIGEM } = {}) {
  const { rows: o } = await client.query('SELECT id FROM empresas WHERE cnpj = $1', [origemCnpj]);
  const origem = o[0]?.id;
  const nomes = origem ? await nomesReaisDaOrigem(client, origem) : new Set();
  const docs = origem ? await documentosReaisDaOrigem(client, origem) : new Set();

  const { rows: cols } = await client.query(
    `SELECT c.table_name, c.column_name, c.udt_name FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema AND t.table_type = 'BASE TABLE'
     WHERE c.table_schema = 'public' AND c.udt_name IN ('varchar', 'text', 'jsonb', 'json', 'bpchar')`
  );
  const { rows: comEmpresa } = await client.query(
    `SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'empresa_id'`
  );
  const tabelasEmpresa = new Set(comEmpresa.map((r) => r.table_name));
  const porTabela = new Map();
  for (const c of cols) {
    if (!tabelasEmpresa.has(c.table_name) && !FILHAS[c.table_name]) continue;
    if (!porTabela.has(c.table_name)) porTabela.set(c.table_name, []);
    porTabela.get(c.table_name).push(c.column_name);
  }

  const achados = [];
  const registrar = (tabela, coluna, amostra, motivo) => {
    if (achados.filter((a) => a.tabela === tabela && a.coluna === coluna).length < 3) achados.push({ tabela, coluna, amostra: `${motivo}: ${String(amostra).slice(0, 140)}` });
    else achados.push({ tabela, coluna, amostra: motivo, repetido: true });
  };
  let linhasLidas = 0;
  for (const [tabela, colunas] of porTabela) {
    if (['empresas', 'usuarios_empresas'].includes(tabela)) continue;
    const where = FILHAS[tabela] || 'empresa_id = $1';
    const sel = colunas.map((c) => `"${c}"::text AS "${c}"`).join(', ');
    const { rows } = await client.query(`SELECT ${sel} FROM "${tabela}" WHERE ${where}`, [modelo]);
    linhasLidas += rows.length;
    for (const r of rows) {
      for (const c of colunas) {
        const v = r[c];
        if (!v) continue;
        if (/(_enc|_hash|^senha|token|linha_[tu])$/.test(c)) continue; // segredos/linhas CNAB cruas
        for (const re of C.PROIBIDOS) if (re.test(v)) registrar(tabela, c, v, `proibido ${re}`);
        for (const m of v.match(/\d[\d./-]{10,18}\d/g) || []) {
          const dig = A.soDigitos(m).replace(/^0+(?=\d{11}$)/, '');
          if (docs.has(dig)) registrar(tabela, c, v, 'documento real');
        }
        const n = A.normalizar(v.replace(/^\d[\d.]*\s+/, ''));
        if (n.length >= 8 && nomes.has(n)) registrar(tabela, c, v, 'nome real');
      }
    }
  }
  // credores do tenant fictício
  const { rows: cred } = await client.query('SELECT nome, documento FROM sienge_credores_cache WHERE tenant = $1', [C.TENANT]);
  for (const r of cred) {
    if (nomes.has(A.normalizar(String(r.nome || '').replace(/^\d[\d.]*\s+/, '')))) registrar('sienge_credores_cache', 'nome', r.nome, 'nome real');
    if (docs.has(A.soDigitos(r.documento))) registrar('sienge_credores_cache', 'documento', r.documento, 'documento real');
  }
  const unicos = achados.filter((a) => !a.repetido);
  log(`Auditoria: ${linhasLidas} linhas lidas, ${achados.length} ocorrência(s).`);
  return achados.length ? unicos.concat(achados.filter((a) => a.repetido).slice(0, 0)).map((a) => ({ ...a, total: achados.filter((b) => b.tabela === a.tabela && b.coluna === a.coluna).length })) : [];
}

module.exports = { auditar };
