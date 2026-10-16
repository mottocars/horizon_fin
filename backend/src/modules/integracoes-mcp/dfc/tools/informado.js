const pool = require('../../../../config/db');
const informado = require('../../../dfc-orcamento-informado/orcamentoInformado.service');
const dfcOrcamento = require('../../../dfc-orcamento/dfcOrcamento.service');
const { z, mesSchema, falha, r2, ferramenta, resolverCentros, resolverNatureza } = require('./comum');

// Ferramentas de ESCRITA do conector "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)" (pedido do usuário): o
// Claude insere/atualiza valores do Orçamento só nas contas com Origem Projeção "HORIZON - INFORMADO"
// (a mesma regra da aba Orçamentos — orcamentoInformado.service.exigirContaInformada) e salva uma
// versão só com essas mudanças. Tudo gravado em nome do usuário que fez login no conector.

const MAX_ITENS = 500;
const valorSchema = z
  .number()
  .finite()
  .refine((v) => Math.abs(v) < 1e15, 'Valor grande demais.')
  .nullable();
const arred = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

// Nomes de centros e naturezas pra devolver legível.
async function nomes(empresaId, centroIds, siengeIds) {
  const [c, n] = await Promise.all([
    pool.query('SELECT sienge_id, name FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])', [empresaId, centroIds]),
    pool.query('SELECT sienge_id, name FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])', [empresaId, siengeIds]),
  ]);
  return { centro: new Map(c.rows.map((r) => [r.sienge_id, r.name])), natureza: new Map(n.rows.map((r) => [r.sienge_id, r.name])) };
}

const contas = {
  name: 'dfc_informado_contas',
  description:
    'Onde dá para inserir/atualizar valores do Orçamento: centros de custo (com Projeta DFC) × naturezas com Origem Projeção ' +
    '"HORIZON - INFORMADO" no plano do centro. Com inicio/fim, traz os valores digitados hoje em cada mês (ainda não salvos ' +
    'em versão ou já salvos). Use antes de dfc_informado_gravar para achar o centro e a natureza certos. Só essas contas ' +
    'podem ser alteradas — as demais origens (Aging, Projeção CEF, Orçamento Empresarial) vêm das integrações.',
  inputSchema: {
    centros: z.array(z.union([z.string(), z.number()])).optional().describe('Centros de custo (ids ou nomes). Vazio = todos.'),
    inicio: mesSchema.optional().describe('Mês inicial (AAAA-MM) para trazer os valores digitados.'),
    fim: mesSchema.optional().describe('Mês final (AAAA-MM).'),
  },
  handler: ferramenta(async (empresaId, { centros, inicio, fim }) => {
    const ids = await resolverCentros(empresaId, centros);
    const lista = await informado.contasInformadas(empresaId, ids);
    if (!lista.length) return 'Nenhuma conta com Origem Projeção "HORIZON - INFORMADO" nos centros com Projeta DFC (aba Plano Contas).';
    let valores = new Map();
    if (inicio || fim) {
      if (!inicio || !fim || fim < inicio) throw falha('Informe inicio e fim (AAAA-MM), com fim igual ou depois de inicio.');
      const todos = await informado.list(empresaId);
      todos
        .filter((v) => v.mes >= inicio && v.mes <= fim)
        .forEach((v) => {
          const k = `${v.centro_id}|${v.sienge_id}`;
          if (!valores.has(k)) valores.set(k, {});
          valores.get(k)[v.mes] = r2(v.valor);
        });
    }
    const porCentro = new Map();
    lista.forEach((l) => {
      if (!porCentro.has(l.centro_id)) porCentro.set(l.centro_id, { centro_id: l.centro_id, centro: l.centro, naturezas: [] });
      porCentro.get(l.centro_id).naturezas.push({
        id: l.sienge_id,
        natureza: l.natureza,
        ...(inicio ? { valores: valores.get(`${l.centro_id}|${l.sienge_id}`) || {} } : {}),
      });
    });
    return [...porCentro.values()];
  }),
};

const gravar = {
  name: 'dfc_informado_gravar',
  description:
    'Insere ou atualiza valores do Orçamento (centro × natureza × mês) nas contas "HORIZON - INFORMADO" — e só nelas: ' +
    'qualquer outra conta é recusada. Valor em R$ com sinal (entrada positiva, saída NEGATIVA); 0 ou null limpa o mês. ' +
    'Tudo ou nada: se um item não puder, nada é gravado. Os valores ficam PENDENTES até dfc_informado_salvar_versao (ou ' +
    '"Salvar Versão" na aba Orçamentos) — só então entram no projetado do DFC. Confirme com o usuário antes de gravar.',
  inputSchema: {
    lancamentos: z
      .array(
        z.object({
          centro: z.union([z.string(), z.number()]).describe('Centro de custo (id ou nome).'),
          natureza: z.union([z.string(), z.number()]).describe('Natureza (id, código ou nome).'),
          mes: mesSchema.describe('Mês (AAAA-MM).'),
          valor: valorSchema.describe('R$ com sinal (saída negativa). 0 ou null limpa.'),
        })
      )
      .min(1)
      .max(MAX_ITENS)
      .describe(`Até ${MAX_ITENS} valores.`),
  },
  handler: ferramenta(async (empresaId, { lancamentos }, ctx) => {
    const centroCache = new Map();
    const natCache = new Map();
    const itens = [];
    for (const l of lancamentos) {
      const kc = String(l.centro);
      if (!centroCache.has(kc)) centroCache.set(kc, (await resolverCentros(empresaId, [l.centro]))[0]);
      const kn = String(l.natureza);
      if (!natCache.has(kn)) natCache.set(kn, (await resolverNatureza(empresaId, l.natureza)).sienge_id);
      itens.push({ centro_id: centroCache.get(kc), sienge_id: natCache.get(kn), mes: l.mes, valor: arred(l.valor) });
    }
    const chaves = new Set(itens.map((i) => `${i.centro_id}|${i.sienge_id}|${i.mes}`));
    if (chaves.size !== itens.length) throw falha('Há o mesmo centro × natureza × mês repetido na lista. Mande cada mês uma vez só.');
    let gravados;
    try {
      gravados = await informado.gravarVarios(empresaId, itens, ctx.usuarioId);
    } catch (err) {
      if (err.expose) throw falha(err.message);
      throw err;
    }
    const n = await nomes(empresaId, [...new Set(itens.map((i) => i.centro_id))], [...new Set(itens.map((i) => i.sienge_id))]);
    return {
      gravados: gravados.length,
      pendente_de_salvar: true,
      aviso: 'Valores gravados como digitados. Entram no DFC depois de dfc_informado_salvar_versao (ou "Salvar Versão" na tela).',
      itens: gravados.map((g) => ({
        centro: `${g.centro_id} ${n.centro.get(g.centro_id) || ''}`.trim(),
        natureza: `${g.sienge_id} ${n.natureza.get(g.sienge_id) || ''}`.trim(),
        mes: g.mes,
        de: g.anterior,
        para: g.valor,
      })),
    };
  }),
};

const replicar = {
  name: 'dfc_informado_replicar',
  description:
    'Grava o MESMO valor em todos os meses de "de" até "ate" (inclusive) para um centro × natureza "HORIZON - INFORMADO", por ' +
    'cima do que houver (como o "Replicar valor até" da aba Orçamentos). Valor com sinal (saída negativa). Fica pendente até ' +
    'dfc_informado_salvar_versao. Confirme com o usuário antes.',
  inputSchema: {
    centro: z.union([z.string(), z.number()]).describe('Centro de custo (id ou nome).'),
    natureza: z.union([z.string(), z.number()]).describe('Natureza (id, código ou nome).'),
    de: mesSchema.describe('Primeiro mês (AAAA-MM).'),
    ate: mesSchema.describe('Último mês (AAAA-MM).'),
    valor: z.number().finite().refine((v) => v !== 0 && Math.abs(v) < 1e15, 'Valor inválido (para limpar use dfc_informado_gravar com null).'),
  },
  handler: ferramenta(async (empresaId, { centro, natureza, de, ate, valor }, ctx) => {
    const [centroId] = await resolverCentros(empresaId, [centro]);
    const nat = await resolverNatureza(empresaId, natureza);
    try {
      const r = await informado.replicar(empresaId, { centro_id: centroId, sienge_id: nat.sienge_id, de, ate, valor: arred(valor) }, ctx.usuarioId, 'MCP');
      return {
        centro: centroId,
        natureza: `${nat.sienge_id} ${nat.name}`,
        meses: r.meses,
        valor: r.valor,
        pendente_de_salvar: true,
        aviso: 'Entram no DFC depois de dfc_informado_salvar_versao (ou "Salvar Versão" na tela).',
      };
    } catch (err) {
      if (err.expose) throw falha(err.message);
      throw err;
    }
  }),
};

const salvarVersao = {
  name: 'dfc_informado_salvar_versao',
  description:
    'Salva uma nova versão do Orçamento SÓ com as mudanças pendentes dos valores informados (HORIZON - INFORMADO) — as ' +
    'pendências das outras fontes (Aging, Projeção CEF, Orçamento Empresarial) não entram e continuam pendentes. ' +
    'Sem confirmar=true, só mostra a prévia do que vai ser salvo (inclui o que outras pessoas digitaram na tela e ainda não foi ' +
    'salvo). Mostre a prévia ao usuário e só salve com a confirmação dele.',
  inputSchema: {
    confirmar: z.boolean().default(false).describe('true = salva a versão; false = só a prévia.'),
  },
  handler: ferramenta(async (empresaId, { confirmar = false }, ctx) => {
    const pend = await dfcOrcamento.pendenciasDaOrigem(empresaId, informado.ORIGEM);
    if (!pend.length) return 'Não há valores informados pendentes de salvar.';
    if (!confirmar) {
      const n = await nomes(empresaId, [...new Set(pend.map((p) => p.centro_id))], [...new Set(pend.map((p) => p.sienge_id))]);
      const { rows: us } = await pool.query('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[])', [
        [...new Set(pend.map((p) => p.responsavel_id).filter(Boolean))],
      ]);
      const usuario = new Map(us.map((u) => [u.id, u.nome]));
      return {
        previa: true,
        mudancas: pend.length,
        aviso: 'Nada foi salvo. Chame de novo com confirmar=true para criar a versão.',
        itens: pend.slice(0, 300).map((p) => ({
          tipo: p.tipo,
          centro: `${p.centro_id} ${n.centro.get(p.centro_id) || ''}`.trim(),
          natureza: `${p.sienge_id} ${n.natureza.get(p.sienge_id) || ''}`.trim(),
          mes: p.mes,
          de: p.valor_anterior === null ? null : r2(p.valor_anterior),
          para: p.valor_novo === null ? null : r2(p.valor_novo),
          por: usuario.get(p.responsavel_id) || null,
          fonte: p.fonte_descricao,
        })),
      };
    }
    try {
      const v = await dfcOrcamento.salvarVersao(empresaId, ctx.usuarioId, { origem: informado.ORIGEM });
      return { versao_salva: v.numero, criado_em: v.criado_em, inclusoes: v.inclusoes, alteracoes: v.alteracoes, exclusoes: v.exclusoes };
    } catch (err) {
      if (err.expose) throw falha(err.message);
      throw err;
    }
  }),
};

module.exports = { contas, gravar, replicar, salvarVersao };
