const demonstrativo = require('../../dre-demonstrativo/demonstrativo.service');
const { ferramenta } = require('../dfc/tools/comum');
const B = require('./base');
const { NOME_FATOR, contaDaLinha, pocsEm } = require('./conta');

const { z, falha, r2, r8, pct, br, PERIODO, CENTROS, periodo, resolverCentros, resolverLinha, dados, rotulo, cabecalho, PD } = B;

// dre_demonstrativo — a DRE como a aba DRE / o dashboard mostram; dre_explicar_numero — como uma linha,
// grupo ou total chegou no valor (a conta do motor, a POC e a composição da base).

const SINAL = { IGUAL: '=', MAIS: '+', MENOS: '−', MAIS_MENOS: '+/−' };
const ORIGEM = { R: 'A receber', P: 'A pagar', E: 'Movimento do extrato', M: 'Criado à mão' };

// Mesma data um ano antes (29/02 vira 28/02).
function umAnoAntes(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a - 1, m, 0)).getUTCDate();
  return `${a - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

// Valores de todas as linhas (nível 2, grupos e totalizadoras) a partir dos de nível 2.
function completar(arvore, valores) {
  const t = PD.totais(arvore, valores);
  const out = {};
  arvore.forEach((g) => {
    out[g.id] = t[g.id];
    g.filhos.forEach((f) => (out[f.id] = valores?.[f.id] ?? null));
  });
  return out;
}

const ordemLinhas = (arvore) =>
  arvore.flatMap((g) => (g.totalizadora ? [{ tipo: 'totalizadora', no: g }] : [{ tipo: 'grupo', no: g }, ...g.filhos.map((f) => ({ tipo: 'linha', no: f, grupo: g }))]));

// AV %: a linha de nível 1 configurada vale 100%; ela e as de baixo mostram o percentual dela.
function avDe(arvore, avaliacao, valores) {
  const ordem = ordemLinhas(arvore);
  const i0 = avaliacao ? ordem.findIndex((x) => x.tipo !== 'linha' && x.no.id === avaliacao.mascara_id) : -1;
  const base = i0 >= 0 ? valores[ordem[i0].no.id] : null;
  return (id) => {
    const i = ordem.findIndex((x) => x.no.id === id);
    if (i0 < 0 || i < i0 || !base || valores[id] === null) return null;
    return pct(valores[id] / Math.abs(base));
  };
}

const variacao = (a, b) => (a === null || b === null || b === undefined || !b ? null : pct((a - b) / Math.abs(b)));

const demonstrativoTool = {
  name: 'dre_demonstrativo',
  description:
    'A DRE do período como a aba DRE do DRE Gerencial e o dashboard mostram: cada grupo, linha e totalizadora com o valor consolidado, a AV % e a regra de cálculo; ' +
    'opcionalmente a coluna de cada centro de custo, a comparação com o mesmo período do ano anterior (ou outro período) e a visão mês a mês com AH %. ' +
    'Período padrão: 1º de janeiro do ano até hoje. Valores em R$ com sinal (despesa negativa).',
  inputSchema: {
    ...PERIODO,
    ...CENTROS,
    por_centro: z.boolean().optional().describe('Inclui a coluna de cada centro (valor e AV %).'),
    comparar_ano_anterior: z.boolean().optional().describe('Compara com o mesmo período do ano anterior (variação %).'),
    comparar_com: z.object({ de: B.PERIODO.de, ate: B.PERIODO.ate }).optional().describe('Compara com outro período (de/ate).'),
    mensal: z.boolean().optional().describe('Inclui o mês a mês (do consolidado ou, com um centro só, do centro) com AH %.'),
  },
  handler: ferramenta(async (empresaId, a) => {
    const p = periodo(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const d = await dados(empresaId, { ...p, centros });
    const { arvore, resultado: R } = d;
    const valores = completar(arvore, R.valores);
    const av = avDe(arvore, R.avaliacao_vertical, valores);

    let comp = null;
    if (a.comparar_ano_anterior || a.comparar_com) {
      const pc = a.comparar_com ? periodo(a.comparar_com) : { de: umAnoAntes(p.de), ate: umAnoAntes(p.ate) };
      const r = await demonstrativo.calcular(empresaId, { ...pc, centros });
      comp = { periodo: `${br(pc.de)} a ${br(pc.ate)}`, valores: completar(arvore, r.valores) };
    }
    const porCentro = a.por_centro ? R.por_centro.map((c) => ({ c, v: completar(arvore, c.valores), av: null })) : [];
    porCentro.forEach((x) => (x.av = avDe(arvore, R.avaliacao_vertical, x.v)));

    const linhas = ordemLinhas(arvore).map((x) => {
      const id = x.no.id;
      const regra = x.tipo === 'linha' ? d.regras.get(id) : null;
      const o = {
        tipo: x.tipo,
        id,
        descricao: x.no.descricao,
        ...(x.tipo !== 'linha' && x.no.icone ? { sinal: SINAL[x.no.icone] } : {}),
        ...(regra ? { regra: regra.curto } : {}),
        valor: r2(valores[id]),
        av_pct: av(id),
      };
      if (comp) {
        o.comparacao = r2(comp.valores[id]);
        o.variacao_pct = variacao(valores[id], comp.valores[id]);
      }
      if (porCentro.length) o.centros = Object.fromEntries(porCentro.map(({ c, v, av: avc }) => [rotulo(c), { valor: r2(v[id]), av_pct: avc(id) }]));
      return o;
    });

    const out = {
      cabecalho: { ...cabecalho(d), ...(comp ? { comparado_com: comp.periodo } : {}) },
      avaliacao_vertical: R.avaliacao_vertical ? `100% = ${R.avaliacao_vertical.descricao}` : 'não configurada',
      linhas,
    };

    if (a.mensal) {
      const unico = R.por_centro.length === 1 || (centros.length === 1 && R.por_centro.length);
      const fonte = unico ? R.por_centro[0] : null;
      const meses = (fonte ? fonte.meses : R.meses).map((mm) => ({ mes: mm.mes, valores: completar(arvore, mm.valores) }));
      const anterior = fonte?.mes_anterior ? completar(arvore, fonte.mes_anterior.valores) : null;
      out.mensal = {
        escopo: fonte ? rotulo(fonte) : 'consolidado',
        leitura: 'AH % = (mês − mês anterior) ÷ |mês anterior|; positivo = melhor para o resultado.',
        linhas: ordemLinhas(arvore).map((x) => ({
          descricao: x.no.descricao,
          tipo: x.tipo,
          meses: meses.map((mm, i) => {
            const ant = i ? meses[i - 1].valores[x.no.id] : anterior ? anterior[x.no.id] : null;
            return { mes: mm.mes, valor: r2(mm.valores[x.no.id]), ah_pct: variacao(mm.valores[x.no.id], ant) };
          }),
        })),
      };
    }
    return out;
  }),
};

// ─── dre_explicar_numero ─────────────────────────────────────────────────────────────────────────
const brl = (v) => (v === null || v === undefined ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pctTxt = (f) => (f === null || f === undefined ? '—' : `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`);

function contaArredondada(c) {
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k.startsWith('fator') ? r8(v) : r2(v)]));
}

// Composição da base de uma linha nos centros e no período (os registros que a formam).
function composicao(d, x, regra, ids, de, ate, limite) {
  const dentro = (dt) => dt && dt >= de && dt <= ate;
  const nomeCentro = (id) => {
    const c = d.m.obras.find((o) => o.id === id);
    return c ? rotulo(c) : String(id);
  };
  if (regra.base.fonte === 'FIN') {
    const ms = new Set(regra.base.mascaras);
    const doPeriodo = d.financeiro.filter((f) => ms.has(f.mascara_id) && ids.includes(f.centro_id) && dentro(f.data));
    const total = doPeriodo.reduce((t, f) => t + f.valor, 0);
    const porNat = new Map();
    doPeriodo.forEach((f) => {
      const k = `${f.natureza_id} ${f.natureza_nome || ''}`.trim();
      porNat.set(k, (porNat.get(k) || 0) + f.valor);
    });
    return {
      fonte: 'Base Financeiro (lançamentos das naturezas que o plano de contas manda para esta linha)',
      sinal_na_linha: regra.base.sinal < 0 ? 'a linha usa a base com o sinal invertido (estorno)' : undefined,
      lancado_no_periodo: r2(total),
      lancamentos_no_periodo: doPeriodo.length,
      por_natureza: [...porNat].sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 12).map(([natureza, v]) => ({ natureza, valor: r2(v) })),
      maiores_lancamentos: [...doPeriodo]
        .sort((p, q) => Math.abs(q.valor) - Math.abs(p.valor))
        .slice(0, limite)
        .map((f) => ({
          data: br(f.data),
          origem: ORIGEM[f.origem] || f.origem,
          titulo: f.titulo ?? f.chave,
          documento: [f.documento, f.numero].filter(Boolean).join(' '),
          contraparte: f.contraparte,
          centro: nomeCentro(f.centro_id),
          natureza: `${f.natureza_id} ${f.natureza_nome || ''}`.trim(),
          valor: r2(f.valor),
          ...(f.status !== 'ORIGINAL' ? { status: f.status === 'AJUSTADO' ? `ajustado: ${f.ajuste_observacao || 'sem observação'}` : 'criado à mão' } : {}),
        })),
      observacao: regra.fator ? 'Com POC, a base é o ACUMULADO desde o primeiro lançamento (veja base_ate_vespera/base_ate_fim); o lançado no período é só a base nova.' : undefined,
    };
  }
  if (regra.base.fonte === 'CORR') {
    const doPeriodo = d.correcoes.filter((c) => ids.includes(c.centro_id) && dentro(c.vencimento));
    const tot = (k) => r2(doPeriodo.reduce((t, c) => t + c[k], 0));
    return {
      fonte: 'Base Correções (correção monetária das parcelas a receber, pelo vencimento)',
      parcelas_no_periodo: doPeriodo.length,
      paga: tot('paga'),
      reparcelada: tot('reparcelada'),
      em_aberto: tot('em_aberto'),
      maiores_parcelas: [...doPeriodo]
        .map((c) => ({ ...c, total: c.paga + c.reparcelada + c.em_aberto }))
        .sort((p, q) => Math.abs(q.total) - Math.abs(p.total))
        .slice(0, limite)
        .map((c) => ({ vencimento: br(c.vencimento), cliente: c.cliente, unidade: c.unidade, titulo: c.titulo, parcela: c.parcela, indexador: c.indexador, centro: nomeCentro(c.centro_id), correcao: r2(c.total) })),
    };
  }
  const col = regra.base.coluna;
  const doPeriodo = d.unidades.filter((u) => ids.includes(u.centro_id) && dentro(u.data) && u[col] !== null && u[col] !== undefined);
  return {
    fonte: 'Base Unidades (contratos, distratos e permutas do Sienge)',
    eventos_no_periodo: doPeriodo.length,
    valor_no_periodo: r2(doPeriodo.reduce((t, u) => t + (u[col] || 0), 0)),
    maiores: [...doPeriodo]
      .sort((p, q) => Math.abs(q[col]) - Math.abs(p[col]))
      .slice(0, limite)
      .map((u) => ({ evento: u.evento, data: br(u.data), centro: nomeCentro(u.centro_id), unidade: u.unidade, contrato: u.contrato, valor: r2(u[col]), ...(u.motivo ? { motivo: u.motivo } : {}) })),
  };
}

const explicar = {
  name: 'dre_explicar_numero',
  description:
    'Explica como um número da DRE foi calculado — de qualquer linha de nível 2, grupo ou totalizadora (Receita Bruta, CIV, Lucro Bruto, EBITDA, Lucro Líquido…), ' +
    'no consolidado ou num centro, no período ou num mês. Traz: a regra, a fórmula com os números (base acumulada × fator na véspera e no fim), ' +
    'a separação entre avanço de obra/base antiga e vendas/base nova, a POC usada em cada centro e de onde ela veio (orçamento vigente, custo, frações), ' +
    'a composição da base no período (lançamentos, contratos ou parcelas que mais pesam), o mês a mês, um exemplo narrado e onde conferir no Excel de auditoria. ' +
    'Grupos e totais vêm abertos nas linhas que os somam.',
  inputSchema: {
    linha: z.union([z.string(), z.number()]).describe('A linha da DRE: nome (ex.: "custo dos imóveis", "receita líquida", "lucro bruto") ou id.'),
    ...PERIODO,
    ...CENTROS,
    mensal: z.boolean().optional().describe('Inclui a conta mês a mês.'),
    limite: z.number().int().min(1).max(50).optional().describe('Quantos registros da base mostrar (padrão 10).'),
  },
  handler: ferramenta(async (empresaId, a) => {
    const p = periodo(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const d = await dados(empresaId, { ...p, centros });
    const { arvore, resultado: R, m } = d;
    const alvo = resolverLinha(arvore, a.linha);
    const valores = completar(arvore, R.valores);
    const limite = a.limite || 10;
    const base = { cabecalho: cabecalho(d), linha: alvo.no.descricao, tipo: alvo.tipo, valor_na_dre: r2(valores[alvo.no.id]) };

    // Grupo / totalizadora: aberto nas linhas que o somam.
    if (alvo.tipo !== 'linha') {
      const i = arvore.indexOf(alvo.no);
      const partes = alvo.tipo === 'grupo' ? alvo.no.filhos.map((f) => ({ linha: f.descricao, valor: r2(valores[f.id]) })) : arvore.slice(0, i).filter((g) => !g.totalizadora).map((g) => ({ grupo: g.descricao, valor: r2(valores[g.id]) }));
      const rl = valores[arvore.find((g) => g.totalizadora)?.id];
      return {
        ...base,
        regra: alvo.tipo === 'grupo' ? 'Grupo de nível 1 = soma das linhas de nível 2 dele.' : 'Totalizadora = soma de todos os grupos (todas as linhas) acima dela na DRE.',
        formula: `${alvo.no.descricao} = ${partes.map((x) => `${x.linha || x.grupo} (${brl(x.valor)})`).join(' + ')} = ${brl(valores[alvo.no.id])}`,
        composicao: partes,
        ...(rl && alvo.tipo === 'totalizadora' && alvo.no.id !== arvore.find((g) => g.totalizadora)?.id ? { margem_sobre_receita_liquida_pct: pct(valores[alvo.no.id] / rl) } : {}),
        por_centro: R.por_centro
          .map((c) => ({ centro: rotulo(c), valor: r2(completar(arvore, c.valores)[alvo.no.id]) }))
          .filter((x) => x.valor)
          .sort((x, y) => Math.abs(y.valor) - Math.abs(x.valor)),
        proximo_passo: 'Para abrir cada parte, chame dre_explicar_numero com a linha de nível 2.',
      };
    }

    const x = alvo.no;
    const regra = d.regras.get(x.id);
    const ids = m.ids;
    const out = { ...base, grupo: alvo.grupo.descricao, regra: regra.texto };

    if (regra.tipo === 'SEM_CALCULO') return { ...out, explicacao: 'A linha não tem cálculo e aparece com traço na DRE. Ajuste a Origem/Cálculo na aba Máscaras (ou configure a POC de Receita).' };

    if (regra.tipo === 'RET') {
      const ordem = m.mascaras;
      const i = ordem.findIndex((y) => y.id === x.id);
      // A base do imposto: as linhas marcadas em "Informar histórico" (sem marcação, todas as de cima).
      const acima = demonstrativo.baseDoImposto(ordem, i);
      const mesesRet = R.meses.map((mm) => {
        const baseMes = acima.reduce((t, y) => t + (mm.valores[y.id] ?? 0), 0);
        const h = d.aliquotaEm(x.id, `${mm.mes}-01`);
        return { mes: mm.mes, base_linhas_acima: r2(baseMes), aliquota_pct: h ? h.aliquota : 0, valor: r2(mm.valores[x.id]) };
      });
      return {
        ...out,
        formula: `${x.descricao} = −alíquota × soma das linhas ${x.imposto_base ? 'da base escolhida' : 'acima'} (${acima.map((y) => y.descricao).join(', ')}), mês a mês e centro a centro.`,
        base_do_imposto: x.imposto_base ? 'escolhida em Máscaras › Informar histórico (só as linhas listadas)' : 'todas as linhas de nível 2 acima (nenhuma escolhida em Máscaras › Informar histórico)',
        meses: mesesRet,
        por_centro: R.por_centro.map((c) => ({ centro: rotulo(c), valor: r2(c.valores[x.id]) })).filter((c) => c.valor),
        observacao: 'Como a alíquota é aplicada centro a centro e mês a mês, a soma bate com o total; meses de prejuízo nas linhas acima geram imposto positivo (devolução) naquele centro.',
      };
    }

    // Linha com base × fator: a conta de cada centro.
    const contas = R.por_centro
      .map((c) => ({ c, conta: contaDaLinha(d, x, c.id, p.de, p.ate), sistema: c.valores[x.id] }))
      .filter((y) => y.conta && (Math.abs(y.conta.valor) > 0.005 || Math.abs(y.conta.base_ate_fim) > 0.005));
    const soma = (k) => contas.reduce((t, y) => t + y.conta[k], 0);
    const total = soma('valor');
    out.formula = regra.fator
      ? `valor = base acumulada até ${br(p.ate)} × ${NOME_FATOR[regra.fator]} em ${br(p.ate)} − base acumulada até ${br(B.vespera(p.de))} × ${NOME_FATOR[regra.fator]} em ${br(B.vespera(p.de))}`
      : 'valor = base acumulada até o fim − base acumulada até a véspera (= o lançado no período; fator 100%)';
    out.conferencia = { soma_dos_centros: r2(total), valor_no_sistema: r2(valores[x.id]), bate: Math.abs(total - (valores[x.id] ?? 0)) < 0.01 };
    out.decomposicao = {
      avanco_sobre_base_antiga: r2(soma('avanco_sobre_base_antiga')),
      base_nova_x_fator: r2(soma('base_nova_x_fator')),
      leitura:
        regra.fator === 'POC_RECEITA'
          ? 'Avanço = o que já estava vendido × o quanto a obra andou no período. Base nova = vendas/permutas/correção do período × a POC de hoje.'
          : regra.fator
            ? 'Avanço = custo já gasto × a fração vendida a mais no período (vendas novas carregam custo). Base nova = custo gasto no período × a fração vendida de hoje.'
            : 'Sem POC: tudo é base nova (o lançado no período).',
    };
    out.por_centro = contas
      .sort((p1, p2) => Math.abs(p2.conta.valor) - Math.abs(p1.conta.valor))
      .map(({ c, conta, sistema }) => ({
        centro: rotulo(c),
        ...contaArredondada(conta),
        valor_no_sistema: r2(sistema),
        ...(regra.fator ? { pocs: { vespera: arredondarPocs(pocsEm(d, c.id, B.vespera(p.de))), fim: arredondarPocs(pocsEm(d, c.id, p.ate)) } } : {}),
      }));

    // Exemplo narrado com o centro que mais pesa.
    const top = out.por_centro[0];
    if (top) {
      out.exemplo = regra.fator
        ? `Em ${top.centro}: a base acumulada foi de ${brl(top.base_ate_vespera)} (véspera) para ${brl(top.base_ate_fim)} (fim) e o fator de ${pctTxt(top.fator_vespera)} para ${pctTxt(top.fator_fim)}. ` +
          `Reconhecido até o fim: ${brl(top.base_ate_fim)} × ${pctTxt(top.fator_fim)} = ${brl(top.reconhecido_ate_fim)}; já reconhecido antes: ${brl(top.base_ate_vespera)} × ${pctTxt(top.fator_vespera)} = ${brl(top.reconhecido_ate_vespera)}; ` +
          `no período: ${brl(top.valor)} — ${brl(top.avanco_sobre_base_antiga)} de avanço sobre a base antiga e ${brl(top.base_nova_x_fator)} da base nova.`
        : `Em ${top.centro}: lançado no período ${brl(top.valor)} (base de ${brl(top.base_ate_vespera)} na véspera para ${brl(top.base_ate_fim)} no fim).`;
    }
    out.composicao_da_base = composicao(d, x, regra, ids, p.de, p.ate, limite);

    if (a.mensal) {
      out.mes_a_mes = d.intervalos.map(([ini, fim]) => {
        const cs = ids.map((id) => contaDaLinha(d, x, id, ini, fim)).filter(Boolean);
        const s = (k) => cs.reduce((t, c) => t + c[k], 0);
        return { mes: ini.slice(0, 7), valor: r2(s('valor')), avanco_sobre_base_antiga: r2(s('avanco_sobre_base_antiga')), base_nova_x_fator: r2(s('base_nova_x_fator')) };
      });
    }
    out.onde_conferir =
      'Excel de auditoria: aba Memória de Cálculo (filtre Linha DRE = esta linha e o Centro) — base × fator mês a mês, com o valor do sistema ao lado; aba POC para os percentuais; ' +
      (regra.base.fonte === 'FIN' ? 'aba Base Financeiro (Id linha + Centro).' : regra.base.fonte === 'CORR' ? 'aba Base Correções.' : 'aba Base Unidades.');
    return out;
  }),
};

function arredondarPocs(x) {
  return {
    data: br(x.data),
    poc_receita: r8(x.poc_receita),
    custo_acumulado: r2(x.custo_acumulado),
    orcamento_vigente: r2(x.orcamento_vigente),
    versao_orcamento: br(x.versao_orcamento),
    fracao_vendida: r8(x.fracao_vendida),
    fracao_permuta: r8(x.fracao_permuta),
    poc_despesa: r8(x.poc_despesa),
    fracao_distratada: r8(x.fracao_distratada),
  };
}

module.exports = { demonstrativoTool, explicar, completar, ordemLinhas, umAnoAntes, arredondarPocs, falha };
