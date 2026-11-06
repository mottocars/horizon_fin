const pool = require('../../../config/db');
const exportacao = require('../../dre-exportacao/exportacao.service');
const drePainel = require('../../dashboards/drePainel.service');
const PD = require('../../dashboards/painelDre/modelo');
const { meses, vespera, fimDoMes } = require('../../dre-demonstrativo/demonstrativo.service');
const { hojeEmBrasilia } = require('../../extrato-contas-sienge/extratoContas-api.client');
const { z, falha, r2 } = require('../dfc/tools/comum');

// Base das ferramentas do módulo DRE do conector Horizon: período (o padrão da tela: 1º de janeiro do ano
// até hoje), centros e linhas por nome ou id, e os dois conjuntos de dados que todas usam, com cache curto
// (as perguntas de um CFO vêm em sequência sobre o mesmo período):
//   dados(...)  — exportacao.service.dados: o motor da DRE (demonstrativo.service::motor), a DRE do sistema,
//                 as regras de cada linha e as bases linha a linha (Financeiro, Unidades, Correções,
//                 Orçamento, Plano de Contas, Fora da DRE) — o mesmo do Excel de auditoria;
//   painel(...) — dashboards/drePainel.service + painelDre/modelo (cópia gerada da tela): indicadores,
//                 fluxo da receita, carteira POC, simulador — o mesmo do dashboard Demonstração do Resultado.

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const PERIODO = {
  de: dataSchema.optional().describe('Início do período (AAAA-MM-DD). Padrão: 1º de janeiro do ano atual (como a tela).'),
  ate: dataSchema.optional().describe('Fim do período (AAAA-MM-DD). Padrão: hoje.'),
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .describe('Um mês inteiro (AAAA-MM), no lugar de de/ate.'),
  ano: z.number().int().min(2000).max(2100).optional().describe('Um ano inteiro (no ano atual, até hoje), no lugar de de/ate.'),
};
const CENTROS = {
  centros: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .describe('Centros de custo (id, nome ou apelido). Vazio = todos com "Realiza DRE" (o consolidado).'),
};

const semAcento = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
const br = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null);
const pct = (v, casas = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** (casas + 2)) / 10 ** casas);
const r8 = (v) => (v === null || v === undefined ? v : Math.round(v * 1e8) / 1e8);

function periodo(a = {}) {
  const hoje = hojeEmBrasilia();
  if (a.mes) {
    const fim = fimDoMes(`${a.mes}-01`);
    return { de: `${a.mes}-01`, ate: fim > hoje && a.mes === hoje.slice(0, 7) ? hoje : fim };
  }
  if (a.ano) {
    const fim = `${a.ano}-12-31`;
    return { de: `${a.ano}-01-01`, ate: String(a.ano) === hoje.slice(0, 4) ? hoje : fim };
  }
  const de = a.de || `${hoje.slice(0, 4)}-01-01`;
  const ate = a.ate || hoje;
  if (de > ate) throw falha(`O início (${br(de)}) não pode ser depois do fim (${br(ate)}).`);
  return { de, ate };
}

// Centros com "Realiza DRE" por id, nome ou apelido (sem acento, parte do nome vale se for único).
async function resolverCentros(empresaId, lista) {
  if (!lista || !lista.length) return [];
  const { rows } = await pool.query(
    `SELECT sienge_id::int AS id, name AS nome, NULLIF(TRIM(apelido), '') AS apelido, realiza_dre
       FROM centros_custo_sienge WHERE empresa_id = $1`,
    [empresaId]
  );
  return lista.map((item) => {
    const t = semAcento(item);
    if (/^\d+$/.test(t)) {
      const c = rows.find((r) => r.id === Number(t));
      if (!c) throw falha(`Centro de custo ${t} não encontrado.`);
      if (!c.realiza_dre) throw falha(`O centro ${c.id} ${c.nome} não está com "Realiza DRE" (aba Centros Custos do DRE Gerencial): ele não entra na DRE.`);
      return c.id;
    }
    const nomes = (r) => [r.nome, r.apelido].filter(Boolean).map(semAcento);
    const naDre = rows.filter((r) => r.realiza_dre);
    const exato = naDre.filter((r) => nomes(r).includes(t));
    const achados = exato.length ? exato : naDre.filter((r) => nomes(r).some((n) => n.includes(t)));
    if (!achados.length) {
      const fora = rows.find((r) => nomes(r).some((n) => n.includes(t)));
      throw falha(
        fora
          ? `O centro ${fora.id} ${fora.nome} não está com "Realiza DRE": ele não entra na DRE.`
          : `Nenhum centro da DRE com "${item}". Centros da DRE: ${naDre.map((r) => `${r.id} ${r.apelido || r.nome}`).join('; ')}.`
      );
    }
    if (achados.length > 1) throw falha(`"${item}" corresponde a vários centros: ${achados.map((r) => `${r.id} ${r.apelido || r.nome}`).join('; ')}. Use o id.`);
    return achados[0].id;
  });
}

// Linha da DRE (nível 2, grupo de nível 1 ou totalizadora) por id ou descrição.
function resolverLinha(arvore, valor) {
  const t = semAcento(valor);
  if (!t) throw falha('Informe a linha da DRE (nome ou id).');
  const todas = arvore.flatMap((g) => [{ tipo: g.totalizadora ? 'totalizadora' : 'grupo', no: g, grupo: g }, ...g.filhos.map((f) => ({ tipo: 'linha', no: f, grupo: g }))]);
  if (/^\d+$/.test(t)) {
    const a = todas.find((x) => x.no.id === Number(t));
    if (!a) throw falha(`Nenhuma linha da DRE com id ${t}.`);
    return a;
  }
  const exato = todas.filter((x) => semAcento(x.no.descricao) === t);
  const achados = exato.length ? exato : todas.filter((x) => semAcento(x.no.descricao).includes(t));
  if (!achados.length) throw falha(`Nenhuma linha da DRE com "${valor}". Linhas: ${todas.map((x) => x.no.descricao).join('; ')}.`);
  if (achados.length > 1) {
    // Prefere a de nível 2 quando o grupo tem o mesmo nome.
    const linhas = achados.filter((x) => x.tipo === 'linha');
    if (linhas.length === 1) return linhas[0];
    throw falha(`"${valor}" corresponde a várias linhas: ${achados.map((x) => `${x.no.id} ${x.no.descricao} (${x.tipo})`).join('; ')}. Use o id.`);
  }
  return achados[0];
}

// ─── Cache ───────────────────────────────────────────────────────────────────────────────────────
const CACHE_MS = 3 * 60 * 1000;
const cache = new Map();
function memo(chave, fn) {
  const c = cache.get(chave);
  if (c && Date.now() - c.em < CACHE_MS) return c.promessa;
  for (const [k, v] of cache) if (Date.now() - v.em >= CACHE_MS) cache.delete(k);
  const promessa = fn();
  cache.set(chave, { em: Date.now(), promessa });
  promessa.catch(() => cache.delete(chave));
  return promessa;
}

function dados(empresaId, { de, ate, centros = [] }) {
  return memo(`d|${empresaId}|${de}|${ate}|${[...centros].sort().join(',')}`, () => exportacao.dados(empresaId, { de, ate, centros }));
}

// Dashboard: o painel nunca passa de hoje (a DRE é do realizado).
function painel(empresaId, { de, ate, centros = [] }) {
  return memo(`p|${empresaId}|${de}|${ate}|${[...centros].sort().join(',')}`, async () => PD.preparar(await drePainel.painel(empresaId, { de, ate, centros })));
}

// Rótulo do centro (apelido, como nas colunas da DRE).
const rotulo = (c) => `${c.id} · ${c.rotulo || c.nome}`;
const escopoTexto = (d) => (d.filtrado ? d.m.obras.map(rotulo).join(', ') : 'consolidado de todos os centros com "Realiza DRE"');
const cabecalho = (d) => ({ periodo: `${br(d.de)} a ${br(d.ate)}`, centros: escopoTexto(d), meses: d.intervalos.length });

module.exports = {
  z,
  falha,
  r2,
  r8,
  pct,
  br,
  semAcento,
  PERIODO,
  CENTROS,
  periodo,
  resolverCentros,
  resolverLinha,
  dados,
  memo,
  painel,
  rotulo,
  cabecalho,
  meses,
  vespera,
  fimDoMes,
  PD,
};
