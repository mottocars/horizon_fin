const { z } = require('zod');
const pool = require('../../../config/db');

// Só estas views entram nas consultas do Claude — nunca as tabelas reais.
// Cada view já filtra a própria empresa sozinha (current_setting, ver
// database/schema.sql) — é essa allowlist + a config de empresa setada na
// mesma transação (ver executar() abaixo) que garante o isolamento
// multi-tenant de verdade, não a query do usuário estar "certa".
const VIEWS_PERMITIDAS = new Set([
  'mcp_sie_income',
  'mcp_sie_income_categorias',
  'mcp_sie_income_recebimentos',
  'mcp_sie_customers',
  'mcp_sie_customers_phones',
  'mcp_cobranca_clientes_clusters',
  'mcp_regua_cobranca_historico_registros',
]);

// Defesa em profundidade complementar à allowlist acima — bloqueia
// qualquer palavra de escrita/DDL/administração, e também `set_config`/
// `current_setting` (as views dependem dessas funções pra filtrar por
// empresa; deixar o texto do usuário chamá-las de novo, dentro da mesma
// transação, poderia em tese tentar embaralhar esse isolamento).
const PALAVRAS_BLOQUEADAS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE|COPY|CALL|EXECUTE|VACUUM|MERGE|LOCK|INTO|DBLINK|SET_CONFIG|CURRENT_SETTING|PG_SLEEP|PG_READ_FILE|PG_READ_BINARY_FILE|PG_LS_DIR|PG_TERMINATE_BACKEND|PG_CANCEL_BACKEND)\b/i;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Remove comentários (-- e /* */) só pra facilitar a checagem do primeiro
// token e a extração de tabelas — a query de verdade que roda no banco é
// sempre a original (com comentários e tudo), nunca esta versão "limpa".
function removerComentarios(sql) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function validar(sqlOriginal) {
  const semComentarios = removerComentarios(sqlOriginal).trim();

  // Só 1 statement: no máximo 1 ";" e, se houver, só no finalzinho.
  const semicolons = semComentarios.split(';');
  if (semicolons.length > 2 || (semicolons.length === 2 && semicolons[1].trim() !== '')) {
    throw badRequest('Só é permitida 1 instrução SQL por consulta (nada de múltiplos comandos separados por ";").');
  }
  const sqlSemPontoVirgula = semicolons[0].trim();

  if (!/^\s*(SELECT|WITH)\b/i.test(sqlSemPontoVirgula)) {
    throw badRequest('A consulta precisa começar com SELECT ou WITH — nenhum comando de escrita é permitido.');
  }

  if (PALAVRAS_BLOQUEADAS.test(sqlSemPontoVirgula)) {
    throw badRequest('A consulta contém uma palavra-chave não permitida (comandos de escrita/administração são bloqueados).');
  }

  // Toda tabela referenciada (FROM/JOIN) precisa estar na allowlist das
  // views mcp_*. Nota: expressões como EXTRACT(campo FROM coluna) também
  // batem nesta checagem e serão rejeitadas — use date_part('campo', coluna)
  // no lugar de EXTRACT(... FROM ...) para evitar isso.
  const referencias = [...sqlSemPontoVirgula.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  const foraDaAllowlist = referencias.filter((nome) => !VIEWS_PERMITIDAS.has(nome));
  if (foraDaAllowlist.length > 0) {
    throw badRequest(
      `Tabela(s) não permitida(s) nesta consulta: ${[...new Set(foraDaAllowlist)].join(', ')}. ` +
        `Use somente: ${[...VIEWS_PERMITIDAS].join(', ')} (chame descrever_esquema_dados para ver as colunas de cada uma).`
    );
  }
  if (referencias.length === 0) {
    throw badRequest('A consulta precisa referenciar pelo menos uma das views permitidas em um FROM/JOIN.');
  }

  return sqlSemPontoVirgula;
}

async function executar(empresaId, sqlValidado) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 5000');
    await client.query("SELECT set_config('app.empresa_id', $1, true)", [String(empresaId)]);
    const resultado = await client.query(`SELECT * FROM (${sqlValidado}) AS sub LIMIT 500`);
    await client.query('COMMIT');
    return resultado.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  name: 'consultar_dados_sql',
  description:
    'Executa uma consulta SQL de LEITURA (somente SELECT) contra as tabelas de contas a receber, clientes e ' +
    'cobrança, para responder perguntas analíticas que não são cobertas pelas outras ferramentas. Use ' +
    'descrever_esquema_dados primeiro para saber os nomes de tabelas/colunas disponíveis. Restrições ' +
    'obrigatórias: apenas uma instrução SELECT (ou WITH), sem ponto e vírgula múltiplo, sem qualquer comando de ' +
    'escrita (INSERT/UPDATE/DELETE/DROP/ALTER/etc.), resultado limitado a no máximo 500 linhas. NÃO inclua ' +
    'filtro de empresa na query — ele já é aplicado automaticamente pelas próprias views. Evite a sintaxe ' +
    'EXTRACT(campo FROM coluna); use date_part(\'campo\', coluna) no lugar.',
  inputSchema: {
    sql: z.string().min(10).max(4000).describe('A consulta SQL (SELECT/WITH) a executar, usando apenas as views mcp_*.'),
  },
  handler(empresaId) {
    return async ({ sql }) => {
      try {
        const sqlValidado = validar(sql);
        const linhas = await executar(empresaId, sqlValidado);
        return { content: [{ type: 'text', text: JSON.stringify(linhas, null, 2) }] };
      } catch (err) {
        const mensagem = err.expose ? err.message : 'Não foi possível executar esta consulta. Verifique a sintaxe SQL e os nomes de tabela/coluna.';
        return { isError: true, content: [{ type: 'text', text: mensagem }] };
      }
    };
  },
};
