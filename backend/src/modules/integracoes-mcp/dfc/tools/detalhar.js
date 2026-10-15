const pool = require('../../../../config/db');
const detalhamento = require('../../../dfc-detalhamento/detalhamento.service');
const { z, mesSchema, r2, ferramenta, resolverCentros, resolverNatureza } = require('./comum');

// O "Detalhamento" da aba DFC (clique no valor): tudo que compõe o valor de uma natureza num mês —
// lançamentos do extrato (realizado) ou, no projetado, cada fonte (informado, parcelas do Aging,
// Orçamento Empresarial, rastreio da Projeção CEF passo a passo).

const MAX_LINHAS = 150;

// Valor de um bloco no formato dele (percentuais vêm em fração: 0,4855 -> "48.55%").
function fmt(v, formato) {
  if (typeof v !== 'number') return v;
  if (formato === 'pct' || formato === 'pct4') return `${Math.round(v * 1000000) / 10000}%`;
  return r2(v);
}

// Blocos da tela -> JSON simples.
function bloco(b) {
  if (b.tipo === 'campos') return { titulo: b.titulo, campos: Object.fromEntries(b.itens.map((i) => [i.rotulo, fmt(i.valor, i.formato)])) };
  if (b.tipo === 'passos') {
    return {
      titulo: b.titulo,
      calculo: b.itens.map((p) => `${p.op ? `${p.op} ` : ''}${p.rotulo}: ${fmt(p.valor, p.formato)}${p.nota ? ` (${p.nota})` : ''}`),
    };
  }
  if (b.tipo === 'tabela') {
    return {
      titulo: b.titulo,
      colunas: b.colunas.map((c) => c.rotulo),
      linhas: b.linhas.slice(0, MAX_LINHAS).map((l) => b.colunas.map((c) => fmt(l[c.chave], c.formato) ?? null)),
      ...(b.linhas.length > MAX_LINHAS ? { observacao: `Mostrando ${MAX_LINHAS} de ${b.linhas.length} linhas — use dfc_lancamentos para filtrar.` } : {}),
      ...(b.total ? { total: Object.fromEntries(Object.entries(b.total).map(([k, v]) => [k, r2(v)])) } : {}),
    };
  }
  return { nota: b.texto };
}

module.exports = {
  name: 'dfc_detalhar_valor',
  description:
    'Mostra tudo que compõe o valor de UMA natureza em UM mês do fluxo: no realizado, os lançamentos do extrato por centro de ' +
    'custo (título, documento, favorecido, rateio); no projetado, por centro e origem — valor informado e histórico, parcelas ' +
    'do Aging, Orçamento Empresarial com o prazo médio, ou o rastreio completo da Projeção CEF (parâmetros, avanço da obra, ' +
    'unidades, passo a passo). Avisa quando a fonte mudou depois da versão salva do Orçamento.',
  inputSchema: {
    mes: mesSchema.describe('Mês (AAAA-MM).'),
    tipo: z.enum(['realizado', 'projetado']).describe('realizado (extrato) ou projetado (Orçamento).'),
    natureza: z.union([z.string(), z.number()]).describe('Natureza: id, código (1.01.01.01) ou parte do nome.'),
    centros: z.array(z.union([z.string(), z.number()])).optional().describe('Centros de custo (ids ou nomes). Vazio = todos.'),
    lado: z.enum(['entradas', 'saidas', 'ambos']).default('ambos').describe('Entradas, saídas ou ambos.'),
  },
  handler: ferramenta(async (empresaId, { mes, tipo, natureza, centros, lado = 'ambos' }) => {
    const nat = await resolverNatureza(empresaId, natureza);
    let ids = await resolverCentros(empresaId, centros);
    const semCentro = !ids.length;
    if (!ids.length) {
      const { rows } = await pool.query('SELECT sienge_id FROM centros_custo_sienge WHERE empresa_id = $1', [empresaId]);
      ids = rows.map((r) => r.sienge_id);
    }
    const lados = lado === 'ambos' ? ['E', 'S'] : [lado === 'entradas' ? 'E' : 'S'];
    const resultado = [];
    for (const l of lados) {
      const d = await detalhamento.detalhar(empresaId, {
        tipo: tipo === 'realizado' ? 'R' : 'P',
        mes,
        lado: l,
        natureza: nat.sienge_id,
        centros: ids,
        semCentro,
      });
      if (!d.grupos.length) continue;
      resultado.push({
        lado: l === 'E' ? 'Entradas' : 'Saídas',
        total: r2(d.total),
        ...(d.versao ? { versao_orcamento: d.versao.numero } : {}),
        grupos: d.grupos.map((g) => ({
          titulo: g.titulo,
          origem: g.subtitulo,
          resumo: g.resumo || undefined,
          valor: r2(g.valor),
          ...(g.valor_fonte !== undefined && r2(g.valor_fonte) !== r2(g.valor) ? { valor_na_fonte_hoje: r2(g.valor_fonte) } : {}),
          avisos: g.avisos?.length ? g.avisos : undefined,
          blocos: g.blocos.map(bloco),
        })),
      });
    }
    return {
      natureza: `${nat.sienge_id} ${nat.name}`,
      mes,
      tipo,
      resultado: resultado.length ? resultado : 'Nada compõe esta natureza neste mês (com os filtros informados).',
    };
  }),
};
