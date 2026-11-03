const { CORES } = require('../../../utils/excelMarca');
const { layout, tabela, codigo, rotuloCentro } = require('./comum');

// Abas de base da exportação de auditoria da DRE: uma linha por registro de cada fonte — é delas que a
// Memória de Cálculo e a POC tiram cada número (SOMASES). Fora da DRE e Plano de Contas mostram o
// outro lado: o que não entrou e por quê, e a classificação de cada natureza em cada centro.

const ORIGEM = { R: 'A receber', P: 'A pagar', E: 'Movimento do extrato', M: 'Lançamento criado' };
const STATUS = { ORIGINAL: 'Original', AJUSTADO: 'Ajustado', CRIADO: 'Criado à mão' };
const SITUACAO = {
  D: 'Disponível',
  C: 'Reservada',
  R: 'Reserva técnica',
  E: 'Permuta',
  M: 'Mútuo',
  P: 'Proposta',
  V: 'Vendida',
  L: 'Locado',
  T: 'Transferido',
  G: 'Vendido/Terceiros',
  O: 'Vendida em pré-contrato',
};
const MOTIVO = {
  DOCUMENTO: 'Tipo de documento fora da DRE',
  SEM_CENTRO: 'Sem centro de custo',
  CENTRO_SEM_CADASTRO: 'Centro de custo sem cadastro',
  CENTRO_SEM_DRE: 'Centro sem "Realiza DRE"',
  SEM_NATUREZA: 'Sem natureza',
  NAO_ENTRA: 'Natureza "NÃO ENTRA NA DRE"',
  SEM_MASCARA: 'Natureza sem Máscara DRE',
  MASCARA_SEM_FINANCEIRO: 'Máscara não calcula pelo Financeiro',
};
const ORIGEM_MASCARA = {
  CONTRATOS_VENDAS: 'os contratos de venda',
  UNIDADES_IMOBILIARIAS: 'as unidades',
  FINANCEIRO: 'a correção monetária',
  IMPOSTO_FIXO: 'a alíquota do imposto',
};

const NOMES = {
  financeiro: 'Base Financeiro',
  unidades: 'Base Unidades',
  correcoes: 'Base Correções',
  orcamento: 'Base Orçamento',
  plano: 'Plano de Contas',
  fora: 'Fora da DRE',
};

const COL_FINANCEIRO = [
  { chave: 'data', rotulo: 'Data na DRE', largura: 11, formato: 'data' },
  { chave: 'mes', rotulo: 'Mês', largura: 9, formato: 'mes' },
  { chave: 'periodo', rotulo: 'No período?', largura: 8 },
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 26 },
  { chave: 'grupo', rotulo: 'Grupo DRE (nível 1)', largura: 26 },
  { chave: 'mascara', rotulo: 'Linha DRE (nível 2)', largura: 32 },
  { chave: 'mascara_id', rotulo: 'Id linha', largura: 7 },
  { chave: 'natureza_id', rotulo: 'Cód. natureza', largura: 11, codigo: true },
  { chave: 'natureza', rotulo: 'Natureza', largura: 32 },
  { chave: 'origem', rotulo: 'Origem', largura: 14 },
  { chave: 'titulo', rotulo: 'Título / Id Sienge', largura: 11, codigo: true },
  { chave: 'documento', rotulo: 'Documento', largura: 10 },
  { chave: 'numero', rotulo: 'Nº documento', largura: 14 },
  { chave: 'contraparte', rotulo: 'Cliente / Fornecedor / Histórico', largura: 38 },
  { chave: 'vencimento', rotulo: 'Vencimento (1ª parcela)', largura: 11, formato: 'data' },
  { chave: 'parcelas', rotulo: 'Parcelas', largura: 8, formato: 'int' },
  { chave: 'percentual', rotulo: '% rateio', largura: 9, formato: 'pctRateio' },
  { chave: 'valor', rotulo: 'Valor na DRE', largura: 15, formato: 'moeda', total: true, destaque: true },
  { chave: 'status', rotulo: 'Status', largura: 11 },
  { chave: 'valor_original', rotulo: 'Valor antes do ajuste', largura: 14, formato: 'moeda' },
  { chave: 'centro_original', rotulo: 'Centro original', largura: 9, codigo: true },
  { chave: 'natureza_original', rotulo: 'Natureza original', largura: 11, codigo: true },
  { chave: 'observacao', rotulo: 'Observação do ajuste', largura: 44 },
  { chave: 'por', rotulo: 'Ajustado / criado por', largura: 18 },
  { chave: 'em', rotulo: 'Em', largura: 15, formato: 'dataHora' },
];

const COL_UNIDADES = [
  { chave: 'evento', rotulo: 'Evento', largura: 10 },
  { chave: 'data', rotulo: 'Data (contrato / distrato / avaliação)', largura: 13, formato: 'data' },
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 24 },
  { chave: 'unidade', rotulo: 'Unidade', largura: 14 },
  { chave: 'tipo', rotulo: 'Tipo', largura: 14 },
  { chave: 'situacao', rotulo: 'Situação hoje (Sienge)', largura: 16 },
  { chave: 'contrato', rotulo: 'Contrato', largura: 10, codigo: true },
  { chave: 'cancelado', rotulo: 'Cancelado?', largura: 9 },
  { chave: 'motivo', rotulo: 'Motivo do distrato', largura: 26 },
  { chave: 'participacao', rotulo: 'Participação no contrato', largura: 11, formato: 'pct' },
  { chave: 'fracao', rotulo: 'Fração ideal da unidade', largura: 13, formato: 'fracao' },
  { chave: 'venda', rotulo: 'Venda (valor × participação)', largura: 15, formato: 'moeda', total: true },
  { chave: 'permuta', rotulo: 'Permuta (avaliação)', largura: 14, formato: 'moeda', total: true },
  { chave: 'estorno', rotulo: 'Estorno de venda (−valor)', largura: 15, formato: 'moeda', total: true },
  { chave: 'recebido', rotulo: 'Recebido do cliente (distrato)', largura: 14, formato: 'moeda', total: true },
  { chave: 'devolvido', rotulo: 'Devolvido ao cliente (distrato)', largura: 14, formato: 'moeda', total: true },
  { chave: 'distrato_liquido', rotulo: 'Receita líquida do distrato', largura: 14, formato: 'moeda', total: true },
  { chave: 'fracao_vendida', rotulo: 'Fração vendida (fração × participação)', largura: 13, formato: 'fracao', total: true },
  { chave: 'fracao_permuta', rotulo: 'Fração em permuta', largura: 12, formato: 'fracao', total: true },
  { chave: 'fracao_distratada', rotulo: 'Fração distratada', largura: 12, formato: 'fracao', total: true },
  { chave: 'estimado', rotulo: 'Valor estimado (estoque)', largura: 14, formato: 'moeda', total: true },
];

const COL_CORRECOES = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 24 },
  { chave: 'cliente', rotulo: 'Cliente', largura: 34 },
  { chave: 'unidade', rotulo: 'Unidade', largura: 14 },
  { chave: 'titulo', rotulo: 'Título', largura: 9, codigo: true },
  { chave: 'parcela', rotulo: 'Parcela', largura: 8, codigo: true },
  { chave: 'documento', rotulo: 'Documento', largura: 10 },
  { chave: 'documento_numero', rotulo: 'Nº documento', largura: 14 },
  { chave: 'indexador', rotulo: 'Indexador', largura: 11 },
  { chave: 'vencimento', rotulo: 'Vencimento (data na DRE)', largura: 12, formato: 'data' },
  { chave: 'data_baixa', rotulo: 'Última baixa com correção', largura: 12, formato: 'data' },
  { chave: 'paga', rotulo: 'Correção paga', largura: 14, formato: 'moeda', total: true },
  { chave: 'reparcelada', rotulo: 'Correção reparcelada', largura: 14, formato: 'moeda', total: true },
  { chave: 'em_aberto', rotulo: 'Correção em aberto (hoje)', largura: 14, formato: 'moeda', total: true },
  {
    chave: 'total',
    rotulo: 'Total (base da DRE)',
    largura: 15,
    formato: 'moeda',
    total: (l) => l.paga + l.reparcelada + l.em_aberto,
    destaque: true,
    formula: (n, l) => ({ formula: `L${n}+M${n}+N${n}`, result: l.paga + l.reparcelada + l.em_aberto }),
  },
];

const COL_ORCAMENTO = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 28 },
  { chave: 'inicio', rotulo: 'Início da versão', largura: 12, formato: 'data' },
  { chave: 'categoria', rotulo: 'Categoria', largura: 30 },
  { chave: 'valor', rotulo: 'Valor', largura: 16, formato: 'moeda', total: true, destaque: true },
  { chave: 'vigente', rotulo: 'Vigente no fim do período?', largura: 12 },
  { chave: 'atualizado_em', rotulo: 'Atualizado em', largura: 15, formato: 'dataHora' },
];

const COL_FORA = [
  { chave: 'motivo', rotulo: 'Motivo', largura: 30 },
  { chave: 'data', rotulo: 'Data', largura: 11, formato: 'data' },
  { chave: 'mes', rotulo: 'Mês', largura: 9, formato: 'mes' },
  { chave: 'origem', rotulo: 'Origem', largura: 14 },
  { chave: 'titulo', rotulo: 'Título / Id Sienge', largura: 11, codigo: true },
  { chave: 'documento', rotulo: 'Documento', largura: 10 },
  { chave: 'numero', rotulo: 'Nº documento', largura: 14 },
  { chave: 'contraparte', rotulo: 'Cliente / Fornecedor / Histórico', largura: 38 },
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8, codigo: true },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 26 },
  { chave: 'plano', rotulo: 'Plano de contas', largura: 14 },
  { chave: 'natureza_id', rotulo: 'Cód. natureza', largura: 11, codigo: true },
  { chave: 'natureza', rotulo: 'Natureza', largura: 32 },
  { chave: 'mascara', rotulo: 'Máscara DRE', largura: 28 },
  { chave: 'percentual', rotulo: '% rateio', largura: 9, formato: 'pctRateio' },
  { chave: 'valor', rotulo: 'Valor', largura: 15, formato: 'moeda', total: true, destaque: true },
  { chave: 'status', rotulo: 'Status', largura: 11 },
];

// Plano de Contas: as colunas de contagem/valor são fórmulas sobre a Base Financeiro (montadas em
// escrever, que conhece o layout dela).
const COL_PLANO = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 26 },
  { chave: 'plano', rotulo: 'Plano que vale', largura: 14 },
  { chave: 'natureza_id', rotulo: 'Cód. natureza', largura: 11, codigo: true },
  { chave: 'natureza', rotulo: 'Natureza', largura: 36 },
  { chave: 'classificacao', rotulo: 'Classificação (Máscara DRE)', largura: 34 },
  { chave: 'grupo', rotulo: 'Grupo DRE (nível 1)', largura: 28 },
  { chave: 'uso', rotulo: 'Como entra na DRE', largura: 40 },
  { chave: 'lancamentos', rotulo: 'Linhas na Base Financeiro', largura: 11, formato: 'int', total: (l) => l.n },
  { chave: 'valor', rotulo: 'Valor na Base Financeiro (até o fim)', largura: 16, formato: 'moeda', total: (l) => l.v },
];

// Linhas de cada base, já no formato das colunas.
function linhas(d) {
  const centro = (id) => {
    const c = d.centros.get(Number(id));
    return c ? rotuloCentro({ id: c.id, rotulo: c.apelido || c.nome }) : id === null || id === undefined ? null : `${id} · (sem cadastro)`;
  };
  const mascaras = new Map(d.m.mascaras.map((x) => [x.id, x]));
  const grupos = new Map(d.arvore.map((g) => [g.id, g.descricao]));
  const grupoDe = (id) => grupos.get(mascaras.get(id)?.parent_id) || null;
  const noPeriodo = (data) => (data && data >= d.de && data <= d.ate ? 'Sim' : 'Não');
  const mesDe = (data) => (data ? `${data.slice(0, 7)}-01` : null);
  const usadas = new Set(d.mascarasFin);

  const financeiro = d.financeiro.map((f) => ({
    data: f.data,
    mes: mesDe(f.data),
    periodo: noPeriodo(f.data),
    centro_id: f.centro_id,
    centro: centro(f.centro_id),
    grupo: grupoDe(f.mascara_id),
    mascara: mascaras.get(f.mascara_id)?.descricao || null,
    mascara_id: f.mascara_id,
    natureza_id: f.natureza_id,
    natureza: f.natureza_nome,
    origem: ORIGEM[f.origem] || f.origem,
    titulo: f.titulo ?? `#${f.chave}`,
    documento: f.documento,
    numero: f.numero,
    contraparte: f.contraparte,
    vencimento: f.vencimento,
    parcelas: f.parcelas,
    percentual: f.percentual,
    valor: f.valor,
    status: STATUS[f.status] || f.status,
    valor_original: f.valor_original,
    centro_original: f.status === 'AJUSTADO' && String(f.centro_original) !== String(f.centro_id) ? f.centro_original : null,
    natureza_original: f.status === 'AJUSTADO' && String(f.natureza_original) !== String(f.natureza_id) ? f.natureza_original : null,
    observacao: f.ajuste_observacao,
    por: f.ajuste_usuario || f.criado_usuario,
    em: f.ajuste_em || f.criado_em,
  }));

  const unidades = d.unidades.map((u) => ({ ...u, centro: centro(u.centro_id), situacao: SITUACAO[u.situacao] || u.situacao }));

  const correcoes = d.correcoes.map((c) => ({ ...c, centro: centro(c.centro_id) }));

  // Versão vigente no fim do período: a de início mais recente até o fim, por centro.
  const vigente = new Map();
  d.orcamento.forEach((o) => {
    if (!vigente.has(o.centro_id) || o.inicio > vigente.get(o.centro_id)) vigente.set(o.centro_id, o.inicio);
  });
  const orcamento = d.orcamento.map((o) => ({ ...o, centro: centro(o.centro_id), vigente: vigente.get(o.centro_id) === o.inicio ? 'Sim' : 'Não' }));

  // Contagem/valor da Base Financeiro por centro × natureza (resultado das fórmulas do Plano de Contas).
  const naBase = new Map();
  d.financeiro.forEach((f) => {
    const k = `${f.centro_id}|${f.natureza_id}`;
    const x = naBase.get(k) || { n: 0, v: 0 };
    naBase.set(k, { n: x.n + 1, v: x.v + f.valor });
  });
  const plano = d.plano.map((p) => {
    const x = mascaras.get(p.mascara_id);
    const b = naBase.get(`${p.centro_id}|${p.natureza_id}`) || { n: 0, v: 0 };
    return {
      centro_id: p.centro_id,
      centro: centro(p.centro_id),
      plano: p.plano,
      natureza_id: p.natureza_id,
      natureza: p.natureza_nome,
      classificacao: p.nao_entra ? 'NÃO ENTRA NA DRE' : x ? x.descricao : p.mascara_id ? `Máscara ${p.mascara_id} (não existe mais)` : 'Sem classificação',
      grupo: x ? grupoDe(x.id) : null,
      uso: p.nao_entra
        ? 'Fica fora da DRE'
        : !x
          ? 'Fica fora da DRE (natureza sem Máscara DRE)'
          : usadas.has(x.id)
            ? 'Pelo Financeiro (lançamentos desta natureza)'
            : `Não pelo Financeiro: a linha calcula por ${ORIGEM_MASCARA[x.origem] || 'outra origem'}`,
      n: b.n,
      v: b.v,
    };
  });

  const fora = d.fora.map((f) => ({
    motivo: MOTIVO[f.motivo] || f.motivo,
    data: f.data,
    mes: mesDe(f.data),
    origem: ORIGEM[f.origem] || f.origem,
    titulo: f.titulo ?? `#${f.chave}`,
    documento: f.documento,
    numero: f.numero,
    contraparte: f.contraparte,
    centro_id: f.centro_id,
    centro: f.centro_id === null ? null : `${f.centro_id} · ${f.centro_nome || '(sem cadastro)'}`,
    plano: f.centro_id === null ? null : f.plano,
    natureza_id: f.natureza_id,
    natureza: f.natureza_nome,
    mascara: f.mascara_nome,
    percentual: f.percentual,
    valor: f.valor,
    status: STATUS[f.status] || f.status,
  }));

  return { financeiro, unidades, correcoes, orcamento, plano, fora };
}

// Layouts (posições) de todas as bases, pras fórmulas das outras abas.
function layouts(L) {
  return {
    financeiro: layout(NOMES.financeiro, COL_FINANCEIRO, L.financeiro.length),
    unidades: layout(NOMES.unidades, COL_UNIDADES, L.unidades.length),
    correcoes: layout(NOMES.correcoes, COL_CORRECOES, L.correcoes.length),
    orcamento: layout(NOMES.orcamento, COL_ORCAMENTO, L.orcamento.length),
    plano: layout(NOMES.plano, COL_PLANO, L.plano.length),
    fora: layout(NOMES.fora, COL_FORA, L.fora.length),
  };
}

function escrever(workbook, abas, LY, L, d, meta) {
  const periodo = `${d.de.split('-').reverse().join('/')} a ${d.ate.split('-').reverse().join('/')}`;
  tabela(workbook, abas.financeiro, LY.financeiro, {
    titulo: 'Base Financeiro — lançamentos que entram na DRE',
    subtitulo: `Cada lançamento (título a receber/pagar, movimento do extrato ou criado à mão) × centro × natureza, já com os ajustes, nas linhas da DRE que calculam pelo Financeiro — desde o primeiro até ${d.ate.split('-').reverse().join('/')} (as linhas com POC usam o acumulado). "No período?" = Sim: dentro de ${periodo}. Valor com sinal (saída negativa).`,
    linhas: L.financeiro,
    meta,
    estiloLinha: (l) => (l.status === 'Ajustado' ? CORES.AMARELO_CLARO : l.status === 'Criado à mão' ? CORES.TEAL_CLARO : null),
  });
  tabela(workbook, abas.unidades, LY.unidades, {
    titulo: 'Base Unidades — contratos, distratos e permutas',
    subtitulo:
      'Da aba Unidades (Sienge): Venda = todo contrato, até o cancelado depois (data do contrato); Distrato = contrato cancelado (data do cancelamento); Permuta = unidade em permuta (data da avaliação); Estoque = só informativo. Sem data, o evento não entra na DRE nem na POC de Despesa.',
    linhas: L.unidades,
    meta,
    estiloLinha: (l) => (l.evento === 'Distrato' ? CORES.VERMELHO_CLARO : l.evento === 'Estoque' ? CORES.CINZA_CLARO : null),
  });
  tabela(workbook, abas.correcoes, LY.correcoes, {
    titulo: 'Base Correções — correção monetária das parcelas a receber',
    subtitulo:
      'Da aba Correções: paga (baixas com pagamento), reparcelada (reparcelamento/substituição) e em aberto (saldo corrigido − saldo, foto de hoje), pela data de vencimento da parcela, até o fim do período. Parcela rateada entre centros entra com a fração de cada um.',
    linhas: L.correcoes,
    meta,
  });
  tabela(workbook, abas.orcamento, LY.orcamento, {
    titulo: 'Base Orçamento — orçamento das obras (divisor da POC de Receita)',
    subtitulo:
      'Da aba Orçamento: cada versão (início) × categoria. Em cada data vale a versão de início mais recente até ela (soma das categorias). Só versões que começam até o fim do período.',
    linhas: L.orcamento,
    meta,
    estiloLinha: (l) => (l.vigente === 'Sim' ? CORES.AZUL_MUITO_CLARO : null),
  });

  // Plano de Contas: contagem e valor por fórmula sobre a Base Financeiro.
  const BF = LY.financeiro;
  const colPlano = LY.plano.colunas.map((c) => {
    if (c.chave === 'lancamentos')
      return { ...c, formula: (n, l) => ({ formula: `COUNTIFS(${BF.faixa('centro_id')},A${n},${BF.faixa('natureza_id')},D${n})`, result: l.n }) };
    if (c.chave === 'valor')
      return { ...c, formula: (n, l) => ({ formula: `SUMIFS(${BF.faixa('valor')},${BF.faixa('centro_id')},A${n},${BF.faixa('natureza_id')},D${n})`, result: l.v }) };
    return c;
  });
  tabela(workbook, abas.plano, { ...LY.plano, colunas: colPlano }, {
    titulo: 'Plano de Contas aplicado — natureza × centro → linha da DRE',
    subtitulo:
      'Toda conta analítica do plano que vale pra cada centro (o plano próprio dele, se tiver; senão o Global), com a Máscara DRE, "NÃO ENTRA NA DRE" ou sem classificação. As duas últimas colunas contam e somam a Base Financeiro (fórmulas).',
    linhas: L.plano,
    meta,
    estiloLinha: (l) => (l.classificacao === 'Sem classificação' ? CORES.AMARELO_CLARO : l.classificacao === 'NÃO ENTRA NA DRE' ? CORES.CINZA_CLARO : null),
  });
  tabela(workbook, abas.fora, LY.fora, {
    titulo: 'Fora da DRE — lançamentos do período que não entraram',
    subtitulo: `Todo lançamento de ${periodo} (títulos pela emissão; movimentos e criados pela data), já com os ajustes, que a DRE deixou de fora, com o motivo${d.filtrado ? ' — só os dos centros do filtro' : ' — de todos os centros da empresa, inclusive os sem "Realiza DRE"'}. É o teste de completude: confira se cada motivo faz sentido.`,
    linhas: L.fora,
    meta,
  });
}

module.exports = { NOMES, MOTIVO, ORIGEM, linhas, layouts, escrever };
