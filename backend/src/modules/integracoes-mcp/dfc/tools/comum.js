const { z } = require('zod');
const pool = require('../../../../config/db');

// Utilidades das ferramentas do MCP do DFC: resposta em texto/JSON, erro legível pro Claude e
// resolução de centro de custo / natureza por id, código ou nome.

const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato AAAA-MM.');

function falha(mensagem) {
  const e = new Error(mensagem);
  e.mcp = true;
  return e;
}

const r2 = (v) => (v === null || v === undefined ? v : Math.round((Number(v) + Number.EPSILON) * 100) / 100);

// Handler que devolve JSON compacto e transforma erro em mensagem pro Claude (sem derrubar a chamada).
function ferramenta(fn) {
  return (empresaId) => async (args) => {
    try {
      const r = await fn(empresaId, args || {});
      return { content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r) }] };
    } catch (err) {
      if (!err.mcp) console.error('Erro em ferramenta do MCP do DFC:', err);
      return { isError: true, content: [{ type: 'text', text: err.mcp ? err.message : `Erro ao consultar: ${err.message}` }] };
    }
  };
}

// Centros por id ou parte do nome. Vazio/undefined = todos (lista vazia).
async function resolverCentros(empresaId, lista) {
  if (!lista || !lista.length) return [];
  const { rows } = await pool.query('SELECT sienge_id, name FROM centros_custo_sienge WHERE empresa_id = $1', [empresaId]);
  return lista.map((item) => {
    const t = String(item).trim();
    if (/^\d+$/.test(t)) {
      const c = rows.find((r) => r.sienge_id === Number(t));
      if (!c) throw falha(`Centro de custo ${t} não encontrado.`);
      return c.sienge_id;
    }
    const alvo = t.toLowerCase();
    const exato = rows.filter((r) => r.name.toLowerCase() === alvo);
    const achados = exato.length ? exato : rows.filter((r) => r.name.toLowerCase().includes(alvo));
    if (!achados.length) throw falha(`Nenhum centro de custo com "${t}" no nome. Use dfc_cadastros (tipo centros_custo) para ver a lista.`);
    if (achados.length > 1) throw falha(`"${t}" corresponde a vários centros: ${achados.map((r) => `${r.sienge_id} ${r.name}`).join('; ')}. Seja mais específico ou use o id.`);
    return achados[0].sienge_id;
  });
}

// Natureza (conta do plano financeiro) por id, código com pontos (1.01.01.01) ou parte do nome.
async function resolverNatureza(empresaId, valor) {
  const t = String(valor ?? '').trim();
  if (!t) throw falha('Informe a natureza (id, código ou nome).');
  const digitos = t.replace(/[.\s-]/g, '');
  if (/^\d+$/.test(digitos)) {
    const { rows } = await pool.query('SELECT sienge_id, name FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = $2', [
      empresaId,
      Number(digitos),
    ]);
    if (!rows[0]) throw falha(`Natureza ${t} não encontrada no plano financeiro.`);
    return rows[0];
  }
  const { rows } = await pool.query(
    `SELECT sienge_id, name FROM planos_financeiros_sienge
      WHERE empresa_id = $1 AND COALESCE(tp_conta, '') <> 'T' AND name ILIKE $2 ORDER BY sienge_id LIMIT 15`,
    [empresaId, `%${t}%`]
  );
  const exato = rows.filter((r) => r.name.toLowerCase() === t.toLowerCase());
  if (exato.length === 1) return exato[0];
  if (!rows.length) throw falha(`Nenhuma natureza com "${t}" no nome. Use dfc_cadastros (tipo naturezas).`);
  if (rows.length > 1) throw falha(`"${t}" corresponde a várias naturezas: ${rows.map((r) => `${r.sienge_id} ${r.name}`).join('; ')}. Use o id.`);
  return rows[0];
}

module.exports = { z, mesSchema, falha, r2, ferramenta, resolverCentros, resolverNatureza };
