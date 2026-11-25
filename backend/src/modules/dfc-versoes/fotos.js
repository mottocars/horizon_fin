const { CONFIG, REALIZADO } = require('./tabelas');

// As cópias ("fotos") de uma versão da DFC — o mesmo mecanismo da DRE (dre-versoes/fotos.js): um schema do
// Postgres com as tabelas que a DFC lê, só com as linhas da empresa, com os mesmos nomes, colunas e índices do
// public (CREATE TABLE ... LIKE ... INCLUDING ALL). Com o search_path apontando pra ele (config/db.js), as
// consultas de sempre leem a cópia. As tabelas copiadas ganham um gatilho que recusa qualquer gravação.
//   dfc_vc_<id> — a configuração e o Orçamento consolidado (tabelas.CONFIG), tirada ao salvar a versão;
//   dfc_vr_<id> — o realizado (tabelas.REALIZADO), tirada ao salvar uma versão NOVA (ou ao criar a INICIAL);
//                 a EDICAO reaproveita a da versão editada.
// Todas as funções recebem `db` (um client em transação, do pool base — nunca de dentro de um contexto).

const schemaConfig = (versaoId) => `dfc_vc_${Number(versaoId)}`;
const schemaRealizado = (versaoId) => `dfc_vr_${Number(versaoId)}`;
const nomeValido = (s) => /^dfc_v[cr]_\d+$/.test(s || '');
const q = (c) => `"${c}"`;

const cacheColunas = new Map();
async function colunas(db, tabela) {
  if (!cacheColunas.has(tabela)) {
    const { rows } = await db.query(
      `SELECT column_name, is_generated, identity_generation FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [tabela]
    );
    if (!rows.length) throw new Error(`Tabela ${tabela} não encontrada.`);
    cacheColunas.set(tabela, {
      nomes: rows.filter((r) => r.is_generated !== 'ALWAYS').map((r) => r.column_name),
      identidade: rows.some((r) => r.identity_generation === 'ALWAYS'),
    });
  }
  return cacheColunas.get(tabela);
}

async function copiar(db, schema, tabelas, empresaId) {
  if (!nomeValido(schema)) throw new Error(`Schema inválido: ${schema}`);
  await db.query(`CREATE SCHEMA ${schema}`);
  for (const t of tabelas) {
    const { nomes, identidade } = await colunas(db, t.tabela);
    const lista = nomes.map(q).join(', ');
    await db.query(`CREATE TABLE ${schema}.${t.tabela} (LIKE public.${t.tabela} INCLUDING ALL)`);
    await db.query(
      `INSERT INTO ${schema}.${t.tabela} (${lista}) ${identidade ? 'OVERRIDING SYSTEM VALUE' : ''}
       SELECT ${lista} FROM public.${t.tabela} x WHERE ${t.filtro}`,
      [empresaId]
    );
    await db.query(
      `CREATE TRIGGER somente_leitura BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${schema}.${t.tabela}
       FOR EACH STATEMENT EXECUTE FUNCTION public.dfc_versao_somente_leitura()`
    );
    await db.query(`ANALYZE ${schema}.${t.tabela}`);
  }
}

const copiarConfig = (db, versaoId, empresaId) => copiar(db, schemaConfig(versaoId), CONFIG, empresaId).then(() => schemaConfig(versaoId));
const copiarRealizado = (db, versaoId, empresaId) =>
  copiar(db, schemaRealizado(versaoId), REALIZADO, empresaId).then(() => schemaRealizado(versaoId));

async function apagar(db, schema) {
  if (!nomeValido(schema)) return;
  await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}

// Volta as tabelas da DFC (tabelas.CONFIG com `restaura`) ao que está na cópia `schema`: apaga o que não existe
// na cópia (filho → pai), depois insere o que falta e atualiza o que mudou (pai → filho), pela chave primária —
// os ids continuam os mesmos. No cadastro do centro só voltam as colunas da DFC (Projeta DFC, Contrato Caixa,
// Prevision) e, em `naturezaDe`, a natureza (Tipo) dos centros alterados pela aba Centros Custos da DFC nesta
// versão (a natureza é a mesma coluna da DRE: a alterada lá continua como está). Na conta bancária, só o Projeta DFC.
async function restaurar(db, schema, empresaId, { naturezaDe = [] } = {}) {
  if (!nomeValido(schema)) throw new Error(`Schema inválido: ${schema}`);
  const tabelas = CONFIG.filter((t) => t.restaura);
  for (const t of [...tabelas].reverse()) {
    const igual = t.pk.map((c) => `s.${q(c)} = x.${q(c)}`).join(' AND ');
    await db.query(`DELETE FROM public.${t.tabela} x WHERE ${t.filtro} AND NOT EXISTS (SELECT 1 FROM ${schema}.${t.tabela} s WHERE ${igual})`, [
      empresaId,
    ]);
  }
  for (const t of tabelas) {
    const { nomes, identidade } = await colunas(db, t.tabela);
    const lista = nomes.map(q).join(', ');
    const resto = nomes.filter((c) => !t.pk.includes(c));
    const acao = resto.length
      ? `UPDATE SET ${resto.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}
         WHERE ROW(${resto.map((c) => `${t.tabela}.${q(c)}`).join(', ')}) IS DISTINCT FROM ROW(${resto.map((c) => `EXCLUDED.${q(c)}`).join(', ')})`
      : 'NOTHING';
    await db.query(
      `INSERT INTO public.${t.tabela} AS ${t.tabela} (${lista}) ${identidade ? 'OVERRIDING SYSTEM VALUE' : ''}
       SELECT ${nomes.map((c) => `s.${q(c)}`).join(', ')} FROM ${schema}.${t.tabela} s ${t.existe ? `WHERE ${t.existe}` : ''}
       ON CONFLICT (${t.pk.map(q).join(', ')}) DO ${acao}`
    );
  }
  // As sequências dos ids (máscaras, parâmetros, dívida PJ) não andam pra trás: um id apagado não volta a ser usado.
  await db.query(
    `UPDATE public.centros_custo_sienge c
        SET projeta_dfc = s.projeta_dfc, codigo_contrato_caixa = s.codigo_contrato_caixa, codigo_prevision = s.codigo_prevision
       FROM ${schema}.centros_custo_sienge s
      WHERE c.empresa_id = $1 AND s.empresa_id = c.empresa_id AND s.sienge_id = c.sienge_id
        AND (c.projeta_dfc IS DISTINCT FROM s.projeta_dfc OR c.codigo_contrato_caixa IS DISTINCT FROM s.codigo_contrato_caixa
             OR c.codigo_prevision IS DISTINCT FROM s.codigo_prevision)`,
    [empresaId]
  );
  if (naturezaDe.length) {
    await db.query(
      `UPDATE public.centros_custo_sienge c SET natureza = s.natureza
         FROM ${schema}.centros_custo_sienge s
        WHERE c.empresa_id = $1 AND s.empresa_id = c.empresa_id AND s.sienge_id = c.sienge_id
          AND c.sienge_id = ANY($2::int[]) AND c.natureza IS DISTINCT FROM s.natureza`,
      [empresaId, naturezaDe]
    );
  }
  await db.query(
    `UPDATE public.contas_bancarias_sienge c SET projeta_dfc = s.projeta_dfc
       FROM ${schema}.contas_bancarias_sienge s
      WHERE c.empresa_id = $1 AND s.empresa_id = c.empresa_id AND s.company_id = c.company_id AND s.numero_conta = c.numero_conta
        AND c.projeta_dfc IS DISTINCT FROM s.projeta_dfc`,
    [empresaId]
  );
}

// Tamanho de uma cópia (pra aba Versões).
async function tamanho(db, schema) {
  if (!nomeValido(schema)) return 0;
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r'`,
    [schema]
  );
  return Number(rows[0].bytes);
}

module.exports = { schemaConfig, schemaRealizado, copiarConfig, copiarRealizado, apagar, restaurar, tamanho, nomeValido };
