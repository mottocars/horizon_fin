// ---------------------------------------------------------------------------------------
// Utilitários de banco do clonador da empresa modelo: metadados (colunas, tipos, FKs,
// sequências), cópia de linhas em lote com novos ids e remapeamento automático de FKs.
// Tudo roda dentro do client/transação recebido — quem chama decide o COMMIT.
// ---------------------------------------------------------------------------------------

const MAX_PARAMETROS = 30000;

class Metadados {
  constructor(client) {
    this.client = client;
    this.colunas = new Map(); // tabela -> [{nome, tipo, udt}]
    this.fks = new Map(); // tabela -> [{colunas:[], tabelaRef, colunasRef:[]}]
    this.sequencias = new Map(); // tabela.coluna -> nome da sequência
  }

  async carregar() {
    const { rows: cols } = await this.client.query(
      `SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.column_default
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
       WHERE c.table_schema = 'public' ORDER BY c.table_name, c.ordinal_position`
    );
    for (const c of cols) {
      if (!this.colunas.has(c.table_name)) this.colunas.set(c.table_name, []);
      this.colunas.get(c.table_name).push({ nome: c.column_name, tipo: c.data_type, udt: c.udt_name, padrao: c.column_default });
      const seq = String(c.column_default || '').match(/nextval\('([^']+)'/);
      if (seq) this.sequencias.set(`${c.table_name}.${c.column_name}`, seq[1]);
    }
    const { rows: fks } = await this.client.query(
      `SELECT c.conrelid::regclass::text AS tabela, c.confrelid::regclass::text AS tabela_ref,
              ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n, o)
                    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o)::text[] AS colunas,
              ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n, o)
                    JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.o)::text[] AS colunas_ref
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'f' AND n.nspname = 'public'`
    );
    for (const f of fks) {
      if (!this.fks.has(f.tabela)) this.fks.set(f.tabela, []);
      this.fks.get(f.tabela).push({ colunas: f.colunas, tabelaRef: f.tabela_ref, colunasRef: f.colunas_ref });
    }
    // Colunas-chave (PK, UNIQUE e FK, dos dois lados): nunca passam pelo anonimizador de texto —
    // são ligações entre tabelas (ex.: numero_conta "SMART").
    this.chaves = new Map();
    const { rows: ks } = await this.client.query(
      `SELECT c.conrelid::regclass::text AS tabela,
              ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey))::text[] AS colunas
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public' AND c.contype IN ('p', 'u', 'f')
       UNION ALL
       SELECT c.confrelid::regclass::text,
              ARRAY(SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = ANY(c.confkey))::text[]
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public' AND c.contype = 'f'`
    );
    for (const k of ks) {
      if (!this.chaves.has(k.tabela)) this.chaves.set(k.tabela, new Set());
      for (const col of k.colunas) this.chaves.get(k.tabela).add(col);
    }
    return this;
  }

  ehChave(tabela, coluna) {
    return Boolean(this.chaves.get(tabela)?.has(coluna));
  }

  colunasDe(tabela) {
    const c = this.colunas.get(tabela);
    if (!c) throw new Error(`Tabela desconhecida: ${tabela}`);
    return c;
  }
  existe(tabela) {
    return this.colunas.has(tabela);
  }
  temColuna(tabela, coluna) {
    return (this.colunas.get(tabela) || []).some((c) => c.nome === coluna);
  }
  fksDe(tabela) {
    return this.fks.get(tabela) || [];
  }
}

// Mapas de ids antigos → novos por tabela (para tabelas com id serial).
class Mapas {
  constructor() {
    this.porTabela = new Map();
  }
  definir(tabela, antigo, novo) {
    if (!this.porTabela.has(tabela)) this.porTabela.set(tabela, new Map());
    this.porTabela.get(tabela).set(String(antigo), novo);
  }
  obter(tabela, antigo) {
    if (antigo === null || antigo === undefined) return antigo;
    const m = this.porTabela.get(tabela);
    if (!m) return undefined;
    return m.get(String(antigo));
  }
  tem(tabela) {
    return this.porTabela.has(tabela);
  }
}

function serializar(valor, coluna) {
  if (valor === undefined) return null;
  if (valor === null) return null;
  if (coluna.udt === 'json' || coluna.udt === 'jsonb') return typeof valor === 'string' ? valor : JSON.stringify(valor);
  return valor;
}

async function inserirLote(client, meta, tabela, linhas) {
  if (!linhas.length) return 0;
  const todas = meta.colunasDe(tabela);
  // só colunas presentes em pelo menos uma linha
  const presentes = todas.filter((c) => linhas.some((l) => Object.prototype.hasOwnProperty.call(l, c.nome)));
  const porLote = Math.max(1, Math.floor(MAX_PARAMETROS / presentes.length));
  let total = 0;
  for (let i = 0; i < linhas.length; i += porLote) {
    const lote = linhas.slice(i, i + porLote);
    const params = [];
    const valores = lote.map((l) => {
      const ph = presentes.map((c) => {
        params.push(serializar(l[c.nome], c));
        return `$${params.length}`;
      });
      return `(${ph.join(',')})`;
    });
    const sql = `INSERT INTO "${tabela}" (${presentes.map((c) => `"${c.nome}"`).join(',')}) VALUES ${valores.join(',')}`;
    await client.query(sql, params);
    total += lote.length;
  }
  return total;
}

async function reservarIds(client, sequencia, quantidade) {
  if (!quantidade) return [];
  const { rows } = await client.query(`SELECT nextval($1::regclass) AS id FROM generate_series(1, $2)`, [sequencia, quantidade]);
  return rows.map((r) => Number(r.id));
}

// Copia linhas já lidas para `tabela`, trocando o id serial (quando houver) por ids novos da
// sequência, remapeando as FKs para tabelas já copiadas (Mapas) e para usuários/empresa.
//   ctx = { client, meta, mapas, empresaModelo, usuario(idAntigo) }
//   opcoes.transformar(linha, original) → linha | null (null = não copia)
//   opcoes.idSerial: nome da coluna serial a renumerar (padrão: 'id' se tiver sequência)
async function copiarLinhas(ctx, tabela, linhasOrigem, opcoes = {}) {
  const { client, meta, mapas } = ctx;
  if (!linhasOrigem.length) return 0;
  const colSerial = opcoes.idSerial !== undefined ? opcoes.idSerial : meta.sequencias.has(`${tabela}.id`) ? 'id' : null;
  const seq = colSerial ? meta.sequencias.get(`${tabela}.${colSerial}`) : null;

  // Pais auto-referenciados (parent_id) precisam do mapa antes de transformar — reserva já.
  let novosIds = null;
  if (seq) {
    novosIds = await reservarIds(client, seq, linhasOrigem.length);
    linhasOrigem.forEach((l, i) => mapas.definir(tabela, l[colSerial], novosIds[i]));
  }

  const fks = meta.fksDe(tabela);
  const saida = [];
  for (let i = 0; i < linhasOrigem.length; i += 1) {
    const original = linhasOrigem[i];
    let linha = { ...original };
    if (seq) linha[colSerial] = novosIds[i];
    if (meta.temColuna(tabela, 'empresa_id')) linha.empresa_id = ctx.empresaModelo;

    for (const fk of fks) {
      if (fk.colunas.length !== 1) continue; // compostas (ex.: (sienge_id, empresa_id)) mantêm o id natural
      const col = fk.colunas[0];
      const valor = linha[col];
      if (valor === null || valor === undefined) continue;
      if (fk.tabelaRef === 'empresas') linha[col] = ctx.empresaModelo;
      else if (fk.tabelaRef === 'usuarios') linha[col] = ctx.usuario(valor);
      else if (fk.tabelaRef === tabela && seq) linha[col] = mapas.obter(tabela, valor) ?? null;
      else if (mapas.tem(fk.tabelaRef)) {
        const novo = mapas.obter(fk.tabelaRef, valor);
        linha[col] = novo === undefined ? null : novo;
      }
    }
    if (opcoes.transformar) linha = opcoes.transformar(linha, original);
    if (linha) saida.push(linha);
  }
  return inserirLote(client, meta, tabela, saida);
}

// Lê e copia de uma vez.
async function copiarTabela(ctx, tabela, where, params, opcoes = {}) {
  const { rows } = await ctx.client.query(`SELECT * FROM "${tabela}" WHERE ${where}${opcoes.ordem ? ` ORDER BY ${opcoes.ordem}` : ''}`, params);
  // auto-referência: pais primeiro
  let linhas = rows;
  if (meta_temParent(ctx.meta, tabela)) linhas = ordenarPaisPrimeiro(rows);
  const n = await copiarLinhas(ctx, tabela, linhas, opcoes);
  ctx.relatorio?.(tabela, n);
  return { quantidade: n, linhas: rows };
}

function meta_temParent(meta, tabela) {
  return meta.fksDe(tabela).some((f) => f.tabelaRef === tabela && f.colunas.length === 1);
}
function ordenarPaisPrimeiro(rows) {
  const porId = new Map(rows.map((r) => [r.id, r]));
  const visitados = new Set();
  const saida = [];
  const visitar = (r) => {
    if (visitados.has(r.id)) return;
    visitados.add(r.id);
    if (r.parent_id && porId.has(r.parent_id)) visitar(porId.get(r.parent_id));
    saida.push(r);
  };
  rows.forEach(visitar);
  return saida;
}

module.exports = { Metadados, Mapas, inserirLote, reservarIds, copiarLinhas, copiarTabela };
