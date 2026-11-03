const basesExcel = require('../../dre-exportacao/planilhas/bases');
const { alertas } = require('../../dre-exportacao/planilhas/roteiro');
const { ferramenta } = require('../dfc/tools/comum');
const { z, falha, r2, br, semAcento, PERIODO, CENTROS, periodo, resolverCentros, resolverLinha, dados, rotulo, cabecalho } = require('./base');
const { orcamentoEm } = require('./conta');

// As bases da DRE linha a linha (dre_lancamentos, dre_unidades, dre_fora_da_dre) e a auditoria
// (dre_auditoria) — os mesmos dados do Excel de auditoria (dre-exportacao/exportacao.service::dados).

const ORIGEM = { R: 'A receber', P: 'A pagar', E: 'Movimento do extrato', M: 'Criado à mão' };
const STATUS = { ORIGINAL: 'original', AJUSTADO: 'ajustado', CRIADO: 'criado à mão' };
const dentro = (dt, de, ate) => dt && dt >= de && dt <= ate;
const contem = (texto, busca) => semAcento(texto).includes(semAcento(busca));

// Agrupa linhas por uma chave, com quantidade e soma, do maior pro menor em valor absoluto.
function agrupar(lista, chave, valor, limite = 30) {
  const g = new Map();
  lista.forEach((x) => {
    const k = chave(x) ?? '(vazio)';
    const atual = g.get(k) || { n: 0, v: 0 };
    g.set(k, { n: atual.n + 1, v: atual.v + valor(x) });
  });
  return [...g]
    .sort((a, b) => Math.abs(b[1].v) - Math.abs(a[1].v))
    .slice(0, limite)
    .map(([k, x]) => ({ grupo: k, quantidade: x.n, valor: r2(x.v) }));
}

// ─── dre_lancamentos ─────────────────────────────────────────────────────────────────────────────
const AGRUPAR_LANC = { natureza: (f) => `${f.natureza_id} ${f.natureza_nome || ''}`.trim(), contraparte: (f) => f.contraparte, mes: (f) => f.data?.slice(0, 7), centro: (f) => f.centro_nome, linha: (f) => f.linha, documento: (f) => f.documento, status: (f) => STATUS[f.status], origem: (f) => ORIGEM[f.origem] };

const lancamentos = {
  name: 'dre_lancamentos',
  description:
    'Os lançamentos do Financeiro que formam a DRE (Base Financeiro do Excel de auditoria): títulos a receber/pagar pela emissão, movimentos do extrato, criados à mão — já rateados por centro × natureza e com os ajustes do Horizon ' +
    '(com o valor de antes, quem ajustou e por quê). Filtre por linha da DRE, centro, natureza, cliente/fornecedor, documento, origem, status; agrupe (por natureza, fornecedor, mês, centro, linha…) ou liste os maiores. ' +
    'Por padrão só os do período; desde_sempre=true traz a base acumulada que as linhas com POC usam.',
  inputSchema: {
    ...PERIODO,
    ...CENTROS,
    linha: z.union([z.string(), z.number()]).optional().describe('Linha (ou grupo) da DRE.'),
    natureza: z.string().optional().describe('Natureza: código ou parte do nome.'),
    contraparte: z.string().optional().describe('Cliente, fornecedor ou histórico (parte do texto).'),
    documento: z.string().optional().describe('Tipo de documento (sigla) ou número.'),
    origem: z.enum(['R', 'P', 'E', 'M']).optional().describe('R a receber, P a pagar, E movimento do extrato, M criado à mão.'),
    status: z.enum(['ORIGINAL', 'AJUSTADO', 'CRIADO']).optional(),
    desde_sempre: z.boolean().optional().describe('Toda a base até o fim do período (não só o período).'),
    agrupar_por: z.enum(Object.keys(AGRUPAR_LANC)).optional(),
    limite: z.number().int().min(1).max(200).optional().describe('Linhas listadas (padrão 30), as de maior valor absoluto.'),
  },
  handler: ferramenta(async (empresaId, a) => {
    const p = periodo(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const d = await dados(empresaId, { ...p, centros });
    const masc = new Map(d.m.mascaras.map((x) => [x.id, x.descricao]));
    let lista = d.financeiro.map((f) => ({ ...f, linha: masc.get(f.mascara_id) }));
    const filtros = [];
    if (a.linha !== undefined) {
      const alvo = resolverLinha(d.arvore, a.linha);
      const ids = new Set(alvo.tipo === 'linha' ? [alvo.no.id] : alvo.tipo === 'grupo' ? alvo.no.filhos.map((f) => f.id) : []);
      if (!ids.size) throw falha('Escolha uma linha de nível 2 ou um grupo (totalizadora não tem lançamentos próprios).');
      lista = lista.filter((f) => ids.has(f.mascara_id));
      filtros.push(`linha ${alvo.no.descricao}`);
      if (!lista.length && alvo.tipo === 'linha') filtros.push(`(esta linha não calcula pelo Financeiro: ${d.regras.get(alvo.no.id)?.texto})`);
    }
    if (!a.desde_sempre) lista = lista.filter((f) => dentro(f.data, p.de, p.ate));
    if (a.natureza) lista = lista.filter((f) => String(f.natureza_id).startsWith(a.natureza.replace(/\D/g, '') || '§') || contem(f.natureza_nome, a.natureza));
    if (a.contraparte) lista = lista.filter((f) => contem(f.contraparte, a.contraparte));
    if (a.documento) lista = lista.filter((f) => contem(f.documento, a.documento) || contem(f.numero, a.documento));
    if (a.origem) lista = lista.filter((f) => f.origem === a.origem);
    if (a.status) lista = lista.filter((f) => f.status === a.status);
    const total = lista.reduce((t, f) => t + f.valor, 0);
    const out = {
      cabecalho: { ...cabecalho(d), base: a.desde_sempre ? `toda a base até ${br(p.ate)}` : 'só o período', filtros: filtros.join('; ') || 'nenhum' },
      lancamentos: lista.length,
      total: r2(total),
    };
    if (a.agrupar_por) out.agrupado = agrupar(lista, AGRUPAR_LANC[a.agrupar_por], (f) => f.valor, a.limite || 30);
    else
      out.maiores = [...lista]
        .sort((x, y) => Math.abs(y.valor) - Math.abs(x.valor))
        .slice(0, a.limite || 30)
        .map((f) => ({
          data: br(f.data),
          origem: ORIGEM[f.origem],
          titulo: f.titulo ?? f.chave,
          documento: [f.documento, f.numero].filter(Boolean).join(' '),
          contraparte: f.contraparte,
          centro: `${f.centro_id} ${f.centro_nome}`,
          natureza: `${f.natureza_id} ${f.natureza_nome || ''}`.trim(),
          linha: f.linha,
          rateio_pct: f.percentual,
          valor: r2(f.valor),
          ...(f.status === 'AJUSTADO'
            ? { ajuste: { valor_antes: r2(f.valor_original), centro_original: f.centro_original, natureza_original: f.natureza_original, observacao: f.ajuste_observacao, por: f.ajuste_usuario, em: br(f.ajuste_em?.toISOString?.() || f.ajuste_em) } }
            : {}),
          ...(f.status === 'CRIADO' ? { criado_por: f.criado_usuario } : {}),
        }));
    return out;
  }),
};

// ─── dre_unidades ────────────────────────────────────────────────────────────────────────────────
const COLUNA = { Venda: 'venda', Distrato: 'estorno', Permuta: 'permuta', Estoque: 'estimado' };
const unidadesTool = {
  name: 'dre_unidades',
  description:
    'Contratos, distratos, permutas e estoque das obras (Base Unidades do Excel de auditoria, aba Unidades do DRE Gerencial): data, unidade, tipo, contrato, valor × participação, fração ideal e as frações que formam a POC de Despesa. ' +
    'Toda venda entra (até a cancelada depois); o distrato estorna na data do cancelamento. Filtre por obra, evento e período (no_periodo); agrupe por obra, evento, mês ou tipo.',
  inputSchema: {
    ...PERIODO,
    ...CENTROS,
    evento: z.enum(['Venda', 'Distrato', 'Permuta', 'Estoque']).optional(),
    no_periodo: z.boolean().optional().describe('Só os eventos com data dentro do período (padrão: true; o estoque não tem data).'),
    unidade: z.string().optional().describe('Parte do nome da unidade.'),
    agrupar_por: z.enum(['centro', 'evento', 'mes', 'tipo']).optional(),
    limite: z.number().int().min(1).max(200).optional(),
  },
  handler: ferramenta(async (empresaId, a) => {
    const p = periodo(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const d = await dados(empresaId, { ...p, centros });
    const nome = new Map(d.m.obras.map((c) => [c.id, rotulo(c)]));
    let lista = d.unidades.map((u) => ({ ...u, centro: nome.get(u.centro_id), valor: u[COLUNA[u.evento]] ?? 0 }));
    if (a.evento) lista = lista.filter((u) => u.evento === a.evento);
    if (a.no_periodo !== false) lista = lista.filter((u) => u.evento === 'Estoque' || dentro(u.data, p.de, p.ate));
    if (a.unidade) lista = lista.filter((u) => contem(u.unidade, a.unidade));
    const porEvento = agrupar(lista, (u) => u.evento, (u) => u.valor, 10);
    const out = {
      cabecalho: { ...cabecalho(d), eventos: a.no_periodo === false ? 'todos' : 'com data no período (estoque: a posição de hoje)' },
      por_evento: porEvento,
      fracoes_no_periodo: {
        vendida: Math.round(lista.reduce((t, u) => t + (u.fracao_vendida || 0), 0) * 1e8) / 1e8,
        permuta: Math.round(lista.reduce((t, u) => t + (u.fracao_permuta || 0), 0) * 1e8) / 1e8,
        distratada: Math.round(lista.reduce((t, u) => t + (u.fracao_distratada || 0), 0) * 1e8) / 1e8,
      },
      leitura: 'Venda = valor do contrato × participação da unidade (todo contrato, até o cancelado depois); Distrato = −valor (estorno); Permuta = avaliação; Estoque = valor estimado pelo ticket médio do tipo.',
    };
    if (a.agrupar_por) {
      const k = { centro: (u) => u.centro, evento: (u) => u.evento, mes: (u) => u.data?.slice(0, 7) || 'sem data', tipo: (u) => u.tipo }[a.agrupar_por];
      out.agrupado = agrupar(lista, k, (u) => u.valor, a.limite || 30);
    } else
      out.lista = [...lista]
        .sort((x, y) => Math.abs(y.valor) - Math.abs(x.valor))
        .slice(0, a.limite || 30)
        .map((u) => ({
          evento: u.evento,
          data: br(u.data),
          obra: u.centro,
          unidade: u.unidade,
          tipo: u.tipo,
          contrato: u.contrato,
          valor: r2(u.valor),
          participacao: u.participacao,
          fracao_ideal: u.fracao,
          ...(u.motivo ? { motivo: u.motivo } : {}),
          ...(u.evento === 'Distrato' ? { recebido: r2(u.recebido), devolvido: r2(u.devolvido) } : {}),
        }));
    return out;
  }),
};

// ─── dre_fora_da_dre ─────────────────────────────────────────────────────────────────────────────
const MOTIVOS = Object.keys(basesExcel.MOTIVO);
const fora = {
  name: 'dre_fora_da_dre',
  description:
    'O teste de completude: os lançamentos do período (títulos pela emissão, movimentos e criados pela data, já com os ajustes) que NÃO entraram na DRE e o motivo — ' +
    'tipo de documento fora da DRE, sem centro, centro sem "Realiza DRE", sem natureza, natureza "NÃO ENTRA NA DRE", natureza sem Máscara DRE (resultado possivelmente esquecido) ' +
    'ou máscara que não calcula pelo Financeiro. Sem filtro de centro, traz todos os centros da empresa. Agrupe por motivo, natureza, centro, documento, contraparte ou mês.',
  inputSchema: {
    ...PERIODO,
    ...CENTROS,
    motivo: z.enum(MOTIVOS).optional(),
    natureza: z.string().optional(),
    contraparte: z.string().optional(),
    agrupar_por: z.enum(['motivo', 'natureza', 'centro', 'documento', 'contraparte', 'mes']).optional(),
    limite: z.number().int().min(1).max(200).optional(),
  },
  handler: ferramenta(async (empresaId, a) => {
    const p = periodo(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const d = await dados(empresaId, { ...p, centros });
    let lista = d.fora;
    if (a.motivo) lista = lista.filter((f) => f.motivo === a.motivo);
    if (a.natureza) lista = lista.filter((f) => String(f.natureza_id || '').startsWith(a.natureza.replace(/\D/g, '') || '§') || contem(f.natureza_nome, a.natureza));
    if (a.contraparte) lista = lista.filter((f) => contem(f.contraparte, a.contraparte));
    const k = {
      motivo: (f) => basesExcel.MOTIVO[f.motivo],
      natureza: (f) => `${f.natureza_id || ''} ${f.natureza_nome || ''}`.trim(),
      centro: (f) => (f.centro_id === null ? null : `${f.centro_id} ${f.centro_nome || ''}`),
      documento: (f) => f.documento,
      contraparte: (f) => f.contraparte,
      mes: (f) => f.data?.slice(0, 7),
    };
    return {
      cabecalho: { ...cabecalho(d), escopo: d.filtrado ? 'só os centros do filtro' : 'todos os centros da empresa' },
      lancamentos: lista.length,
      total: r2(lista.reduce((t, f) => t + f.valor, 0)),
      por_motivo: agrupar(lista, k.motivo, (f) => f.valor, 10),
      ...(a.agrupar_por && a.agrupar_por !== 'motivo'
        ? { agrupado: agrupar(lista, k[a.agrupar_por], (f) => f.valor, a.limite || 30) }
        : {
            maiores: [...lista]
              .sort((x, y) => Math.abs(y.valor) - Math.abs(x.valor))
              .slice(0, a.limite || 20)
              .map((f) => ({
                motivo: basesExcel.MOTIVO[f.motivo],
                data: br(f.data),
                origem: ORIGEM[f.origem],
                titulo: f.titulo ?? f.chave,
                documento: [f.documento, f.numero].filter(Boolean).join(' '),
                contraparte: f.contraparte,
                centro: f.centro_id === null ? 'sem centro' : `${f.centro_id} ${f.centro_nome || ''}`,
                natureza: `${f.natureza_id || ''} ${f.natureza_nome || ''}`.trim(),
                mascara_que_teria: f.mascara_nome,
                valor: r2(f.valor),
              })),
          }),
    };
  }),
};

// ─── dre_auditoria ───────────────────────────────────────────────────────────────────────────────
const tol = (x, t = 0.01) => (Math.abs(x) <= t ? 'OK' : 'DIVERGENTE');

const auditoria = {
  name: 'dre_auditoria',
  description:
    'Audita a DRE do período como o Excel de auditoria: refaz as conferências de forma independente (cada base somada linha a linha × o que o motor usou; a POC de Receita recalculada a partir do orçamento e do custo; ' +
    'a soma dos centros × o consolidado; cada linha de cada centro em cada mês × o sistema), lista os alertas dos dados (obra sem orçamento, custo acima do orçamento, unidade sem fração ideal, natureza sem máscara, ' +
    'revisão de orçamento no período, ajustes e lançamentos criados à mão…), resume o que ficou fora da DRE por motivo e diz quando cada base foi atualizada.',
  inputSchema: { ...PERIODO, ...CENTROS },
  handler: ferramenta(async (empresaId, a) => {
    const p = periodo(a);
    const centros = await resolverCentros(empresaId, a.centros);
    const d = await dados(empresaId, { ...p, centros });
    const { m, resultado: R } = d;
    const ids = m.ids;

    // 1. Base Financeiro × motor (até o fim, desde sempre).
    let difFin = 0;
    d.mascarasFin.forEach((mid) =>
      ids.forEach((id) => {
        const soma = d.financeiro.filter((f) => f.mascara_id === mid && f.centro_id === id && f.data <= p.ate).reduce((t, f) => t + f.valor, 0);
        difFin = Math.max(difFin, Math.abs(soma - m.custoAte.get(mid)(id, p.ate)));
      })
    );
    // 2. Unidades e correções × motor.
    const col = { VALOR_VENDAS: 'venda', RECEITA_PERMUTA: 'permuta', ESTORNO_VENDAS: 'estorno', RECEITA_DISTRATO: 'distrato_liquido', FRACAO_VENDAS: 'fracao_vendida', FRACAO_PERMUTA: 'fracao_permuta', FRACAO_DISTRATADA: 'fracao_distratada' };
    let difUni = 0;
    Object.entries(col).forEach(([calc, k]) =>
      ids.forEach((id) => {
        const soma = d.unidades.filter((u) => u.centro_id === id && u.data && u.data <= p.ate).reduce((t, u) => t + (u[k] || 0), 0);
        difUni = Math.max(difUni, Math.abs(soma - m.base[calc](id, p.ate)));
      })
    );
    let difCorr = 0;
    ids.forEach((id) => {
      const soma = d.correcoes.filter((c) => c.centro_id === id && c.vencimento <= p.ate).reduce((t, c) => t + c.paga + c.reparcelada + c.em_aberto, 0);
      difCorr = Math.max(difCorr, Math.abs(soma - m.base.CORRECAO_MONETARIA(id, p.ate)));
    });
    // 3. POC de Receita recalculada (orçamento da base ÷ custo da base) × motor, em cada ponto.
    let difPoc = 0;
    if (m.pocEm && m.mascaraPoc)
      ids.forEach((id) =>
        d.pontos.forEach((D) => {
          const orc = orcamentoEm(d, id, D).total;
          const custo = Math.abs(d.financeiro.filter((f) => f.mascara_id === m.mascaraPoc.id && f.centro_id === id && f.data <= D).reduce((t, f) => t + f.valor, 0));
          const poc = orc > 0 ? Math.round(Math.min(custo / orc, 1) * 1e8) / 1e8 : 0;
          difPoc = Math.max(difPoc, Math.abs(poc - m.pocEm(id, D).poc));
        })
      );
    // 4. Soma dos centros × consolidado; 5. meses × período.
    let difCentros = 0;
    let difMeses = 0;
    m.mascaras.forEach((x) => {
      if (R.valores[x.id] === null) return;
      difCentros = Math.max(difCentros, Math.abs(R.por_centro.reduce((t, c) => t + (c.valores[x.id] ?? 0), 0) - R.valores[x.id]));
      difMeses = Math.max(difMeses, Math.abs(R.meses.reduce((t, mm) => t + (mm.valores[x.id] ?? 0), 0) - R.valores[x.id]));
    });

    const L = basesExcel.linhas(d);
    const fontes = d.extras;
    const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');
    const ajustados = L.financeiro.filter((f) => f.status !== 'Original');
    return {
      cabecalho: cabecalho(d),
      conferencias: [
        { conferencia: 'Base Financeiro somada linha a linha × o que o motor usou (cada linha × centro, acumulado até o fim)', maior_diferenca: r2(difFin), status: tol(difFin) },
        { conferencia: 'Base Unidades (vendas, permutas, distratos e frações) × motor', maior_diferenca: Math.round(difUni * 1e6) / 1e6, status: tol(difUni, 0.000001) },
        { conferencia: 'Base Correções × motor', maior_diferenca: r2(difCorr), status: tol(difCorr) },
        { conferencia: 'POC de Receita recalculada (custo ÷ orçamento vigente) × motor, em cada fim de mês', maior_diferenca: difPoc, status: tol(difPoc, 0.000001) },
        { conferencia: 'Soma dos centros × consolidado (cada linha)', maior_diferenca: r2(difCentros), status: tol(difCentros) },
        { conferencia: 'Soma dos meses × período (cada linha)', maior_diferenca: r2(difMeses), status: tol(difMeses) },
      ],
      alertas: alertas(d, L).map((x) => ({ nivel: x.nivel, alerta: x.texto, quantidade: x.qtd, valor: r2(x.valor), onde: x.onde })),
      fora_da_dre_por_motivo: agrupar(L.fora, (f) => f.motivo, (f) => f.valor, 10),
      ajustes_e_criados_a_mao: {
        na_base: ajustados.length,
        no_periodo: ajustados.filter((f) => f.periodo === 'Sim').length,
        maiores_no_periodo: ajustados
          .filter((f) => f.periodo === 'Sim')
          .sort((x, y) => Math.abs(y.valor) - Math.abs(x.valor))
          .slice(0, 10)
          .map((f) => ({ data: br(f.data), status: f.status, linha: f.mascara, centro: f.centro, natureza: f.natureza, valor: r2(f.valor), antes: r2(f.valor_original), observacao: f.observacao, por: f.por })),
      },
      fontes_atualizadas_em: {
        contas_a_receber: quando(fontes.receber),
        contas_a_pagar: quando(fontes.pagar),
        extrato: quando(fontes.extrato),
        contratos_de_venda: quando(fontes.contratos),
        unidades: `${quando(fontes.unidades)} (sem rotina no Monitor: só o botão da aba Unidades)`,
      },
      excel_de_auditoria:
        'Para o dossiê completo (fórmulas vivas, memória de cálculo, bases linha a linha), baixe o Excel de auditoria no DRE Gerencial (abas DRE/POC) ou no dashboard Demonstração do Resultado.',
    };
  }),
};

module.exports = { lancamentos, unidadesTool, fora, auditoria };
