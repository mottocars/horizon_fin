const pool = require('../../../config/db');
const agingService = require('../../dashboards/agingPainel.service');
const M = require('../../dashboards/painelAging/modelo');
const { ABAS_SUMARIO } = require('../../dashboards/painelAging/sumarioTexto');
const { textoSimples } = require('../../dashboards/painelFluxo/sumarioTexto');
const { z, falha, r2, ferramenta, resolverCentros, resolverNatureza } = require('../dfc/tools/comum');

// Ferramentas do módulo AGING LIST do conector Horizon (só leitura) — o dashboard Econômico Financeiro ›
// Aging List "como uma pessoa olhando a tela": os mesmos dados (dashboards/agingPainel.service: parcelas
// em aberto do contas a receber e a pagar do Sienge, com rateio, e o saldo bancário de hoje do Saldo
// Contas Bancárias), o mesmo cálculo (dashboards/painelAging/modelo, cópia gerada da tela por
// backend/scripts/sincronizar-painel-fluxo.js) e as mesmas explicações (painelAging/sumarioTexto, o
// Sumário da tela). Mais o histórico de baixas (recebimentos e pagamentos já feitos), que a tela não
// mostra, para pontualidade e recuperação. Fechadas sobre a empresa do conector.

const DASHBOARD = 'economico-financeiro';
const TELA = 'aging';
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const pct1 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 10 : null);
const semAcento = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
const COR_TOM = { good: 'verde', warn: 'amarela', crit: 'vermelha', info: 'azul' };
const partesTxt = (partes) => partes.map((p) => (typeof p === 'string' ? p : p.b)).join('');
const LADO = { receber: 'r', pagar: 'p' };
const NOME_LADO = { r: 'a receber', p: 'a pagar' };

// ─── Base (com cache curto: as perguntas costumam vir em sequência) ──────────────────────────────
const CACHE_MS = 2 * 60 * 1000;
const cache = new Map();
function base(empresaId) {
  const c = cache.get(empresaId);
  if (c && Date.now() - c.em < CACHE_MS) return c.promessa;
  const promessa = agingService.painel(empresaId).then((d) => M.preparar(d));
  cache.set(empresaId, { em: Date.now(), promessa });
  promessa.catch(() => cache.delete(empresaId));
  return promessa;
}

// ─── Filtros (os mesmos da tela) ─────────────────────────────────────────────────────────────────
const listaNomes = z.array(z.union([z.string(), z.number()]));
const FILTROS = {
  inicio: dataSchema.optional().describe('Vencimento a partir desta data. Sem período = toda a carteira em aberto (qualquer vencimento).'),
  fim: dataSchema.optional().describe('Vencimento até esta data.'),
  historico_meses: z
    .number()
    .int()
    .min(0)
    .max(360)
    .optional()
    .describe('Período em meses antes do mês atual, como o Histórico do painel de filtros: início = 1º dia do mês atual − N meses.'),
  horizonte_meses: z
    .number()
    .int()
    .min(0)
    .max(360)
    .optional()
    .describe('Meses depois do mês atual, como o Horizonte: fim = último dia do mês atual + N meses.'),
  periodo_da_tela: z.boolean().optional().describe('true = o período com que a tela abre (1º de janeiro a 31 de dezembro do ano atual).'),
  centros: listaNomes.optional().describe('Centros de custo (id ou parte do nome).'),
  empresas: listaNomes
    .optional()
    .describe('Empresas do Sienge/SPEs (company_id ou parte do nome). Filtra as parcelas E o saldo bancário dessas empresas.'),
  planos_de_contas: listaNomes.optional().describe('Contas do plano de contas (naturezas) por código ou nome.'),
  documentos: z.array(z.string()).optional().describe('Tipos de documento por sigla (CT, NF, DANF…) ou parte do nome.'),
  clientes: listaNomes.optional().describe('Clientes (código ou parte do nome) — filtra só o a receber.'),
  fornecedores: listaNomes.optional().describe('Fornecedores/credores (código ou parte do nome) — filtra só o a pagar.'),
  previsao: z
    .enum(['nao', 'sim', 'todos'])
    .optional()
    .describe('Previsões financeiras: nao (padrão da tela, ficam de fora), sim (só elas) ou todos.'),
  filtro_salvo: z
    .string()
    .optional()
    .describe('Nome de um filtro salvo do usuário na tela (lista "Filtros salvos"); o que for informado aqui soma ou sobrepõe.'),
};

async function filtroSalvo(empresaId, usuarioId, nome) {
  if (!usuarioId) throw falha('Filtros salvos precisam do login do usuário.');
  const { rows } = await pool.query(
    `SELECT nome, filtros FROM usuarios_dashboard_filtros WHERE usuario_id = $1 AND empresa_id = $2 AND dashboard = $3 AND tela = $4 ORDER BY nome`,
    [usuarioId, empresaId, DASHBOARD, TELA]
  );
  const alvo = semAcento(nome).trim();
  const achado = rows.find((r) => semAcento(r.nome) === alvo) || rows.filter((r) => semAcento(r.nome).includes(alvo))[0];
  if (!achado) throw falha(`Nenhum filtro salvo "${nome}". Filtros salvos: ${rows.map((r) => r.nome).join('; ') || 'nenhum'}.`);
  return { nome: achado.nome, ...M.normalizarFiltros(achado.filtros) };
}

// Códigos de um catálogo ({ id: nome }) por código ou parte do nome. Vários achados valem todos (até 30).
function resolverLista(catalogo, itens, rotulo, numerico) {
  const ids = [];
  const entradas = Object.entries(catalogo);
  for (const item of itens || []) {
    const t = String(item).trim();
    const direto = entradas.find(([id]) => semAcento(id) === semAcento(t));
    if (direto) {
      ids.push(direto[0]);
      continue;
    }
    const achados = entradas.filter(([, nome]) => semAcento(nome).includes(semAcento(t)));
    if (!achados.length) throw falha(`Nenhum ${rotulo} com "${t}".`);
    if (achados.length > 30) {
      throw falha(`"${t}" corresponde a ${achados.length} ${rotulo}s (ex.: ${achados.slice(0, 8).map(([, n]) => n).join('; ')}). Seja mais específico ou use o código.`);
    }
    ids.push(...achados.map(([id]) => id));
  }
  return [...new Set(ids)].map((id) => (numerico ? Number(id) : id));
}

// Monta o escopo como a tela: filtro salvo (opcional) + filtros informados + período. Devolve a base,
// o escopo (modelo.escopo) e a descrição do que foi aplicado.
async function montar(empresaId, a, ctx) {
  const B0 = await base(empresaId);
  const hoje = B0.hoje;
  const salvo = a.filtro_salvo ? await filtroSalvo(empresaId, ctx.usuarioId, a.filtro_salvo) : null;
  const f = salvo ? { ...salvo } : M.filtrosVazios();
  const cat = B0.catalogos || {};
  // Lista informada aqui substitui a do filtro salvo (e sai do "todos, menos" dele).
  const trocar = (k, valor) => {
    f[k] = valor;
    f.exceto = f.exceto.filter((x) => x !== k);
  };
  if (a.centros?.length) f.centros = await resolverCentros(empresaId, a.centros);
  if (a.planos_de_contas?.length) trocar('naturezas', await Promise.all(a.planos_de_contas.map(async (p) => String((await resolverNatureza(empresaId, p)).sienge_id))));
  if (a.documentos?.length) trocar('documentos', resolverLista({ ...B0.documentos, ...cat.documentos }, a.documentos, 'tipo de documento', false));
  if (a.clientes?.length) trocar('clientes', resolverLista({ ...B0.pessoas.r, ...cat.clientes }, a.clientes, 'cliente', true));
  if (a.fornecedores?.length) trocar('fornecedores', resolverLista({ ...B0.pessoas.p, ...cat.fornecedores }, a.fornecedores, 'fornecedor', true));
  if (a.previsao) f.previsao = a.previsao;

  // Período: datas > meses informados > meses do filtro salvo > período da tela > toda a carteira.
  const padrao = M.periodoPadrao(hoje);
  const inicio =
    a.inicio ??
    (a.historico_meses !== undefined
      ? M.inicioDe(hoje, a.historico_meses)
      : salvo?.historico !== null && salvo?.historico !== undefined
        ? M.inicioDe(hoje, salvo.historico)
        : a.periodo_da_tela
          ? padrao.inicio
          : null);
  const fim =
    a.fim ??
    (a.horizonte_meses !== undefined
      ? M.fimDe(hoje, a.horizonte_meses)
      : salvo?.horizonte !== null && salvo?.horizonte !== undefined
        ? M.fimDe(hoje, salvo.horizonte)
        : a.periodo_da_tela
          ? padrao.fim
          : null);
  if (inicio && fim && fim < inicio) throw falha('O fim do período precisa ser depois do início.');

  // Empresas (SPEs): as parcelas delas e as contas bancárias delas.
  let B = B0;
  let empresas = [];
  if (a.empresas?.length) {
    const nomes = { ...B0.empresas };
    B0.bancos.contas.forEach((c) => {
      if (!nomes[c.company_id]) nomes[c.company_id] = c.empresa;
    });
    empresas = resolverLista(nomes, a.empresas, 'empresa', true);
    const sel = new Set(empresas);
    B = { ...B0, titulos: B0.titulos.filter((t) => sel.has(t.c)), bancos: { ...B0.bancos, contas: B0.bancos.contas.filter((c) => sel.has(c.company_id)) } };
  }
  const E = M.escopo(B, { inicio, fim, ...f });

  const nomesDe = (lista, fn) => (lista.length > 6 ? [...lista.slice(0, 6).map(fn), `e mais ${lista.length - 6}`] : lista.map(fn));
  // Lista do painel no "todos, menos" (filtro salvo com "Marcar todos"): diz quais ficaram de fora.
  const daLista = (k, rotulo, fn) =>
    f[k].length ? { [f.exceto.includes(k) ? `${rotulo}_todos_menos` : rotulo]: nomesDe(f[k], fn) } : {};
  const aplicado = {
    periodo_vencimento: inicio || fim ? `${inicio ? M.dma(inicio) : 'qualquer data'} a ${fim ? M.dma(fim) : 'qualquer data'}` : 'toda a carteira em aberto',
    ...(salvo ? { filtro_salvo: salvo.nome } : {}),
    ...(f.centros.length ? { centros: nomesDe(f.centros, (id) => M.nomeCentro(B0, id)) } : {}),
    ...(empresas.length ? { empresas: nomesDe(empresas, (id) => M.nomeEmpresa(B0, id)) } : {}),
    ...daLista('naturezas', 'planos_de_contas', (id) => M.nomeNatureza(B0, id)),
    ...daLista('documentos', 'documentos', (id) => M.nomeDocumento(B0, id)),
    ...daLista('clientes', 'clientes', (id) => M.nomePessoa(B0, 'r', id)),
    ...daLista('fornecedores', 'fornecedores', (id) => M.nomePessoa(B0, 'p', id)),
    previsoes_financeiras: { nao: 'fora (padrão)', sim: 'só as previsões', todos: 'documentos e previsões' }[f.previsao],
  };
  return { B: B0, E, f, aplicado, inicio, fim, empresas };
}

function cabecalho(B, aplicado) {
  const quando = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'nunca');
  return {
    empresa: B.empresa,
    hoje: M.dma(B.hoje),
    base_sienge: { a_receber_atualizado_em: quando(B.bases.r), a_pagar_atualizado_em: quando(B.bases.p) },
    saldo_bancario_de: B.bancos.data ? M.dma(B.bancos.data) : 'sem saldo lançado em Saldo Contas Bancárias',
    filtros: aplicado,
    valores: 'R$, saldo corrigido das parcelas em aberto (vencido = até ontem; a vencer = de hoje em diante)',
  };
}

// ─── Faixas ──────────────────────────────────────────────────────────────────────────────────────
const RESUMO = [
  ['vencido_mais_180', [0]],
  ['vencido_91_180', [1]],
  ['vencido_31_90', [2, 3]],
  ['vencido_1_30', [4, 5, 6]],
  ['vence_hoje', [7]],
  ['a_vencer_1_30', [8, 9, 10]],
  ['a_vencer_31_90', [11, 12]],
  ['a_vencer_mais_90', [13, 14]],
];
function faixasDe(fx, modo) {
  if (modo === 'nenhuma') return undefined;
  const pares = modo === 'todas' ? M.FAIXAS.map((f, i) => [f.rotulo, [i]]) : RESUMO;
  const r = {};
  pares.forEach(([k, idx]) => {
    const v = idx.reduce((s, i) => s + fx[i], 0);
    if (Math.abs(v) >= 0.5) r[k] = r2(v);
  });
  return r;
}
// Faixas aceitas no filtro das parcelas: ids da tela (v180, v91, …, h, a1, …, a180) ou os do resumo.
const IDS_FAIXA = [...M.FAIXAS.map((f) => f.id), ...RESUMO.map(([k]) => k)];
function indicesDasFaixas(lista) {
  const s = new Set();
  lista.forEach((id) => {
    const i = M.FAIXAS.findIndex((f) => f.id === id);
    if (i >= 0) s.add(i);
    else (RESUMO.find(([k]) => k === id)?.[1] || []).forEach((x) => s.add(x));
  });
  return s;
}

function grupo(no, faixas) {
  const r = {
    nome: no.nome,
    vencido: r2(no.vencido),
    a_vencer: r2(no.total - no.vencido),
    total: r2(no.total),
    pct_vencido: pct1(no.total ? no.vencido / no.total : 0),
    parcelas: no.n,
  };
  if (no.vencido > 0) r.atraso_medio_dias = Math.round(no.atrasoMedio);
  const fx = faixasDe(no.fx, faixas);
  if (fx) r.faixas = fx;
  return r;
}

// ─── Dimensões do agrupamento ────────────────────────────────────────────────────────────────────
const DIM = { centro: 'centro', plano_de_contas: 'natureza', cliente_fornecedor: 'pessoa', empresa: 'empresa', condicao: 'condicao', documento: 'documento' };
const ORDENAR = { vencido: 'vencido', a_vencer: 'avencer', total: 'total' };

function arvoreLado(E, lado, dims, ordenar, limite, limiteSub, faixas) {
  const linhas = E.linhas.filter((x) => x.t.l === lado);
  const validos = dims.map((d) => DIM[d]).filter((d) => M.dimensoesDoLado(lado).includes(d));
  if (!validos.length) return { aviso: 'Condição de pagamento só existe no a receber.' };
  const ordem = ORDENAR[ordenar] || 'vencido';
  const ordenarNos = (nos) => (ordenar === 'atraso' ? [...nos].sort((x, y) => y.atrasoMedio - x.atrasoMedio || y.vencido - x.vencido) : nos);
  const nivel = (nos, prof) => {
    const lim = prof === 0 ? limite : limiteSub;
    const lista = ordenarNos(nos);
    const out = lista.slice(0, lim).map((no) => {
      const g = grupo(no, faixas);
      if (no.filhos) g.dentro = nivel(no.filhos(), prof + 1);
      return g;
    });
    if (lista.length > lim) out.push({ outros: `${lista.length - lim} grupos a mais (aumente o limite ou filtre)`, total: r2(M.soma(lista.slice(lim).map((n) => n.total))) });
    return out;
  };
  const raiz = M.arvore(E, linhas, validos, lado, ordem);
  const tot = M.porFaixa(linhas);
  return {
    total: { vencido: r2(tot.vencido), a_vencer: r2(tot.aVencer), total: r2(tot.total), pct_vencido: pct1(tot.total ? tot.vencido / tot.total : 0), parcelas: tot.n },
    grupos: nivel(raiz, 0),
  };
}

// ─── Simulação de caixa (a do painel, mais aporte e saldo mínimo) ────────────────────────────────
function simulacao(E, p) {
  const sim = M.simular(E, p);
  const aporte = p.aporte || 0;
  const minimo = p.minimo || 0;
  const dias = sim.dias.map((d) => ({ ...d, ini: d.ini + aporte, fim: d.fim + aporte }));
  let min = Infinity;
  let minData = null;
  dias.forEach((d) => {
    if (d.fim < min) {
      min = d.fim;
      minData = d.data;
    }
  });
  const primeiro = (cond) => dias.find(cond)?.data || null;
  // O cheque especial já está no saldo de partida (caixa livre = Total geral da tela Saldo): abaixo do valor dele,
  // o caixa próprio acabou e o cheque está sendo usado; negativo = falta caixa mesmo usando todo o cheque.
  const { cheque } = sim;
  return {
    sim,
    dias,
    ini: sim.ini + aporte,
    final: sim.final + aporte,
    min,
    minData,
    primeiroNegativo: primeiro((d) => d.fim < 0),
    primeiroCheque: cheque > 0 ? primeiro((d) => d.fim < cheque) : null,
    usoCheque: Math.min(cheque, Math.max(0, cheque - min)),
    diasNoCheque: cheque > 0 ? dias.filter((d) => d.fim < cheque).length : 0,
    primeiroAbaixoMinimo: minimo ? primeiro((d) => d.fim < minimo) : null,
    necessidade: Math.max(0, minimo - min),
    diasNegativos: dias.filter((d) => d.fim < 0).length,
  };
}

function serie(dias, agrupar) {
  if (agrupar === 'dia') {
    return dias.map((d) => ({
      dia: `${M.dma(d.data)} ${M.semana(d.n)}`,
      saldo_inicio: r2(d.ini),
      entradas: r2(d.ent),
      saidas: r2(-d.sai),
      saldo_fim: r2(d.fim),
    }));
  }
  const chave = (d) => {
    if (agrupar === 'mes') return d.data.slice(0, 7);
    const dt = new Date(`${d.data}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); // segunda-feira da semana
    return dt.toISOString().slice(0, 10);
  };
  const grupos = new Map();
  dias.forEach((d) => {
    const k = chave(d);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(d);
  });
  return [...grupos].map(([k, ds]) => ({
    [agrupar === 'mes' ? 'mes' : 'semana']: agrupar === 'mes' ? k : `${M.dma(ds[0].data)} a ${M.dma(ds.at(-1).data)}`,
    saldo_inicio: r2(ds[0].ini),
    entradas: r2(M.soma(ds.map((d) => d.ent))),
    saidas: r2(-M.soma(ds.map((d) => d.sai))),
    saldo_fim: r2(ds.at(-1).fim),
    menor_saldo: r2(Math.min(...ds.map((d) => d.fim))),
  }));
}

function situacaoTexto(s, temBanco, minimo) {
  if (!temBanco) return 'Sem saldo lançado em Saldo Contas Bancárias: a simulação parte de zero (só o efeito das parcelas).';
  if (s.primeiroNegativo)
    return `Falta caixa em ${M.dma(s.primeiroNegativo)}${s.sim.cheque > 0 ? ', mesmo usando todo o cheque especial' : ''}: no pior dia (${M.dma(s.minData)}) faltam ${M.brl(-s.min)} (${s.diasNegativos} dia(s) no vermelho).`;
  if (s.primeiroCheque)
    return `Entra no cheque especial em ${M.dma(s.primeiroCheque)} e usa até ${M.brl(s.usoCheque)} dele (${s.diasNoCheque} dia(s) no cheque); não chega a faltar caixa.`;
  if (s.primeiroAbaixoMinimo) return `Fica abaixo do mínimo de ${M.brl(minimo)} em ${M.dma(s.primeiroAbaixoMinimo)}; faltam ${M.brl(s.necessidade)}.`;
  return `O caixa cobre o período: menor saldo ${M.brl(s.min)} em ${M.dma(s.minData)}.`;
}

const CENARIO = {
  cenario: z
    .enum(['previsto', 'conservador', 'estresse'])
    .optional()
    .describe('Cenário pronto da tela: previsto (tudo no vencimento), conservador (10% de perda e 5 dias de atraso nos recebimentos), estresse (30% e 10 dias).'),
  nao_receber_pct: z.number().min(0).max(100).optional().describe('% das entradas previstas que não entra.'),
  atraso_recebimentos_dias: z.number().int().min(0).max(120).optional().describe('Dias de atraso em todas as entradas.'),
  recuperar_vencido_pct: z.number().min(0).max(100).optional().describe('% do vencido a receber de até 90 dias que entra, dividido pelos dias úteis.'),
  permutas_nao_entram: z.boolean().optional().describe('Permutas e "Não cobrar" não viram dinheiro (padrão true).'),
  partida: z
    .enum(['livre', 'total'])
    .optional()
    .describe('Saldo de partida: livre = caixa livre, o Total geral da tela Saldo Contas Bancárias (Liberado + Limite cheque, com o cheque especial dentro — padrão); total = caixa livre + bloqueado.'),
  aporte: z.number().optional().describe('Dinheiro novo no primeiro dia (aporte, captação), em R$.'),
  saldo_minimo: z.number().optional().describe('Saldo mínimo de segurança, em R$ (para a necessidade de caixa).'),
};
function paramsSim(a, horizonte) {
  const base = M.CENARIOS[a.cenario || 'previsto'];
  return {
    ...M.PADRAO_SIM,
    naoReceber: base.naoReceber,
    atrasoReceb: base.atrasoReceb,
    recuperar: base.recuperar,
    ...(a.nao_receber_pct !== undefined ? { naoReceber: a.nao_receber_pct } : {}),
    ...(a.atraso_recebimentos_dias !== undefined ? { atrasoReceb: a.atraso_recebimentos_dias } : {}),
    ...(a.recuperar_vencido_pct !== undefined ? { recuperar: a.recuperar_vencido_pct } : {}),
    ...(a.permutas_nao_entram !== undefined ? { semCaixa: a.permutas_nao_entram } : {}),
    ...(a.partida ? { partida: a.partida } : {}),
    horizonte,
    aporte: a.aporte || 0,
    minimo: a.saldo_minimo || 0,
  };
}

function partidaInfo(banco) {
  if (!banco.data) return { aviso: 'Sem saldo lançado em Saldo Contas Bancárias.' };
  return {
    data: M.dma(banco.data),
    caixa_livre: r2(banco.livre),
    dos_quais_cheque_especial: r2(banco.cheque),
    bloqueado: r2(banco.bloqueado),
    liberado_mais_bloqueado: r2(banco.total),
    contas: banco.contas,
    regra:
      'Caixa livre = o Total geral da tela Saldo Contas Bancárias = Liberado + Limite cheque, tudo o que dá para usar no dia. Liberado: nas contas de classificação LIBERADA, saldo − bloqueio, só se positivo (sem o cheque especial). Limite cheque: o limite restante do cheque especial (saldo negativo já sai do limite: −200 com limite 500 → 300; o limite só conta no dia com período aberto). ' +
      'dos_quais_cheque_especial = quanto do caixa livre é cheque especial. Bloqueado = contas de classificação BLOQUEADA + bloqueios registrados (fora do caixa livre).',
  };
}

// ─── Ferramentas ─────────────────────────────────────────────────────────────────────────────────
const guia = {
  name: 'aging_guia',
  description:
    'Comece por aqui. Explica o Aging List (dashboard Econômico Financeiro): de onde vêm o contas a receber e o contas a pagar, ' +
    'saldo corrigido, faixas de vencimento, rateio, previsões financeiras, filtros, como o saldo das contas bancárias entra na ' +
    'projeção, como cada indicador e o simulador são calculados, qual ferramenta usar para cada pergunta, a situação da base ' +
    '(última atualização, quantidade de parcelas) e os filtros salvos do usuário. Traz o Sumário da tela inteiro.',
  inputSchema: {},
  handler: ferramenta(async (empresaId, _a, ctx) => {
    const B = await base(empresaId);
    const conta = (l) => B.titulos.filter((t) => t.l === l);
    const { rows: salvos } = ctx.usuarioId
      ? await pool.query(
          `SELECT nome, filtros FROM usuarios_dashboard_filtros WHERE usuario_id = $1 AND empresa_id = $2 AND dashboard = $3 AND tela = $4 ORDER BY nome`,
          [ctx.usuarioId, empresaId, DASHBOARD, TELA]
        )
      : { rows: [] };
    const quando = (d) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'nunca');
    const md = [
      `# Aging List — ${B.empresa}`,
      `Hoje: ${M.dma(B.hoje)}. Base do Sienge: a receber atualizado em ${quando(B.bases.r)} (${conta('r').length} parcelas em aberto); a pagar em ${quando(B.bases.p)} (${conta('p').length} parcelas em aberto). Saldo bancário: ${B.bancos.data ? `${M.dma(B.bancos.data)}, ${B.bancos.contas.length} contas` : 'sem saldo lançado'}.`,
      '',
      '## Regras',
      '- **Em aberto** = parcela com saldo > 0 no Sienge. Valor = **saldo corrigido** (correção monetária e juros do contrato; sem ele, o saldo simples). A base é atualizada pelas rotinas "Base do contas a receber/pagar (Sienge)" do Monitor de Integrações.',
      '- **Atraso** = hoje − vencimento. **Vencido** = venceu até ontem; **hoje**; **a vencer** = de hoje em diante. Faixas: vencido +180, 91–180, 61–90, 31–60, 16–30, 8–15, 1–7; hoje; a vencer 1–7, 8–15, 16–30, 31–60, 61–90, 91–180, +180 dias.',
      '- **Rateio**: cada parcela pode ser rateada entre centros de custo e contas do plano de contas; cada fatia leva a fração dela (a soma bate com o saldo). Filtros de centro e plano de contas pegam só as fatias.',
      '- **Previsões financeiras** (de contrato de medição, pedido de compra…) ficam FORA por padrão: o documento real que as substitui também está no Sienge e somar os dois duplica.',
      '- **Período**: a tela abre com o ano atual (vencimento de 01/01 a 31/12). Nas ferramentas, sem período = toda a carteira em aberto; use inicio/fim, historico_meses/horizonte_meses (como o painel de filtros) ou periodo_da_tela=true.',
      '- **Saldo das contas**: vem de Operações › Saldo Contas Bancárias, último dia lançado até hoje. **Caixa livre = o Total geral** daquela tela (**Liberado + Limite cheque**), tudo o que dá para usar no dia para pagar as contas: o Liberado (nas contas de classificação liberada, saldo menos bloqueios, só a parte positiva, sem o cheque) + o limite restante do cheque especial. Na tela Saldo, "Liberado" NÃO inclui o cheque. Sempre diga quanto do caixa livre é cheque especial. Bloqueado (contas bloqueadas + bloqueios) fica fora.',
      '- **Projeção de caixa**: parte do caixa livre (ou do liberado + bloqueado) e, dia a dia, recebe e paga o que vence (fim de semana cai na segunda; feriados não são tratados). O vencido a pagar não entra; o vencido a receber só entra pela recuperação (% do vencido de até 90 dias, dividido pelos dias úteis). Permutas e "Não cobrar" não viram dinheiro. Como o cheque especial já está no saldo de partida: saldo abaixo do valor do cheque = usando o cheque especial; saldo negativo = falta caixa mesmo usando todo o cheque.',
      '- Cliente filtra só o a receber; fornecedor, só o a pagar. Empresa (SPE) filtra as parcelas e o saldo bancário dela.',
      '',
      '## Qual ferramenta usar',
      '- Visão geral como na tela (cards, escada de faixas, maiores, simulador): **aging_painel**.',
      '- "Quanto está vencido por obra/centro, plano de contas, cliente, fornecedor, SPE, condição, documento?": **aging_agrupar** (até 3 níveis, faixas e ordem).',
      '- "Quais títulos/parcelas…?" (de um cliente, de uma faixa, vencendo na semana, um título específico): **aging_parcelas**.',
      '- "Vou ter caixa? Quando fica negativo? E se não receber X%? Qual SPE vai faltar dinheiro? Projeção dos próximos meses": **aging_projecao_caixa** (dia, semana ou mês; por SPE).',
      '- Inadimplência (taxa, envelhecimento, maiores devedores, por empreendimento/condição, marcados como inadimplentes/sub judice, recuperação): **aging_inadimplencia**.',
      '- O que foi recebido/pago de fato, pontualidade, atraso médio de pagamento, renegociações/distratos: **aging_historico_baixas**.',
      '',
      '## Filtros salvos do usuário',
      salvos.length
        ? salvos
            .map((s) => {
              const f = M.normalizarFiltros(s.filtros);
              const partes = [
                f.historico !== null ? `${f.historico} meses de histórico` : null,
                f.horizonte !== null ? `${f.horizonte} de horizonte` : null,
                ...['centros', 'documentos', 'naturezas', 'clientes', 'fornecedores']
                  .filter((k) => f[k].length)
                  .map((k) => `${f.exceto.includes(k) ? 'todos menos ' : ''}${f[k].length} ${k === 'naturezas' ? 'planos de contas' : k}`),
                f.previsao !== 'nao' ? `previsão: ${f.previsao}` : null,
              ].filter(Boolean);
              return `- **${s.nome}**: ${partes.join(', ') || 'sem filtros'} (use filtro_salvo: "${s.nome}")`;
            })
            .join('\n')
        : '- nenhum',
      '',
      '## Sumário da tela',
      ...ABAS_SUMARIO.map((aba) =>
        [`### ${aba.titulo}`, aba.resumo, ...aba.blocos.map((b) => `**${b.titulo}**\n${b.texto ? textoSimples(b.texto) : b.itens.map((i) => `- ${textoSimples(i)}`).join('\n')}`)].join('\n')
      ),
    ];
    return md.join('\n');
  }),
};

const SECOES = ['indicadores', 'escada', 'aging', 'maiores', 'simulador'];
const painel = {
  name: 'aging_painel',
  description:
    'O Aging List como aparece na tela: os 8 indicadores com as etiquetas (verde/amarela/vermelha), a escada de vencimentos ' +
    '(a pagar × a receber por faixa, líquido e caixa acumulado partindo do saldo bancário de hoje), o aging por centro de custo ' +
    '(vencido, a vencer e total de cada carteira), os maiores devedores e credores e o simulador do caixa dos próximos dias. ' +
    'Mesmos filtros da tela (período, centros, SPEs, plano de contas, documentos, clientes, fornecedores, previsões, filtro salvo). ' +
    'Sem período = toda a carteira; periodo_da_tela=true = como a tela abre (ano atual).',
  inputSchema: {
    ...FILTROS,
    secoes: z.array(z.enum(SECOES)).optional().describe('Só estas seções (padrão: todas).'),
    simulador_dias: z.number().int().min(1).max(90).optional().describe('Horizonte do simulador em dias (padrão 15, como a tela).'),
    ...CENARIO,
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const { B, E, aplicado } = await montar(empresaId, a, ctx);
    const quer = (s) => !a.secoes?.length || a.secoes.includes(s);
    const out = { cabecalho: cabecalho(B, aplicado) };
    if (quer('indicadores')) {
      out.indicadores = M.indicadores(E).map((t) => ({
        card: t.titulo,
        valor: t.valor_fmt,
        detalhe: partesTxt(t.detalhe),
        etiqueta: `${t.etiqueta.texto} (${COR_TOM[t.etiqueta.tom]})`,
      }));
    }
    if (quer('escada')) {
      const es = M.escada(E);
      out.escada_de_vencimentos = {
        posicao_liquida: r2(es.posicao),
        vencido_liquido: r2(es.vencidoLiq),
        liquido_hoje_a_30_dias: r2(es.trintaLiq),
        caixa_livre_hoje: E.banco.data ? r2(E.banco.livre) : null,
        ...(E.banco.cheque ? { dos_quais_cheque_especial: r2(E.banco.cheque) } : {}),
        faixas: es.linhas.map((l) => ({
          faixa: l.rotulo,
          a_receber: r2(l.r),
          a_pagar: r2(l.p),
          liquido: r2(l.liq),
          ...(l.acum !== null ? { caixa_acumulado: r2(l.acum) } : {}),
        })),
        leitura: 'Caixa acumulado = caixa livre de hoje + líquido das faixas a vencer, acumulado: o caixa se tudo for pago e recebido no vencimento.',
      };
    }
    if (quer('aging')) {
      out.aging_por_centro_de_custo = {
        a_receber: arvoreLado(E, 'r', ['centro'], 'vencido', 20, 10, 'nenhuma'),
        a_pagar: arvoreLado(E, 'p', ['centro'], 'vencido', 20, 10, 'nenhuma'),
      };
    }
    if (quer('maiores')) {
      const m = (lado, quais) => {
        const r = M.maiores(E, lado, quais);
        return {
          total: r2(r.total),
          [lado === 'r' ? 'clientes' : 'fornecedores']: r.pessoas,
          concentracao_10_maiores_pct: r.total ? Math.round(r.concentracao * 10) / 10 : null,
          maiores: r.itens.map((x) => ({
            nome: x.nome,
            valor: r2(x.valor),
            parcelas: x.parcelas,
            ...(quais === 'vencido' ? { maior_atraso_dias: x.maiorAtraso } : { proximo_vencimento: M.dma(x.proximo) }),
          })),
        };
      };
      out.maiores = {
        quem_mais_me_deve_vencido: m('r', 'vencido'),
        quem_mais_me_deve_proximos_30_dias: m('r', 'prox30'),
        a_quem_mais_devo_vencido: m('p', 'vencido'),
        a_quem_mais_devo_proximos_30_dias: m('p', 'prox30'),
      };
    }
    if (quer('simulador')) {
      const p = paramsSim(a, a.simulador_dias || 15);
      const s = simulacao(E, p);
      out.simulador = {
        cenario: M.cenarioDe(p) ? M.CENARIOS[M.cenarioDe(p)].rotulo : 'personalizado',
        ajustes: { nao_receber_pct: p.naoReceber, atraso_recebimentos_dias: p.atrasoReceb, recuperar_vencido_pct: p.recuperar, permutas_nao_entram: p.semCaixa },
        saldo_de_partida: r2(s.ini),
        entradas: r2(M.soma(s.dias.map((d) => d.ent))),
        saidas: r2(-M.soma(s.dias.map((d) => d.sai))),
        saldo_no_fim: r2(s.final),
        menor_saldo: r2(s.min),
        dia_do_menor_saldo: M.dma(s.minData),
        necessidade_de_caixa: r2(s.necessidade),
        situacao: situacaoTexto(s, !!E.banco.data, p.minimo),
        dia_a_dia: serie(s.dias, 'dia'),
      };
    }
    return out;
  }),
};

const agrupar = {
  name: 'aging_agrupar',
  description:
    'Aging agrupado (o "Aging por centro de custo" da tela, com qualquer agrupamento): vencido, a vencer, total, % vencido, ' +
    'parcelas, atraso médio ponderado e as faixas de cada grupo, para o a receber e/ou o a pagar. Agrupe por até 3 níveis ' +
    '(centro, plano_de_contas, cliente_fornecedor, empresa = SPE, condicao = condição de pagamento do a receber, documento). ' +
    'Para descer a um grupo, filtre por ele (ex.: centros) e agrupe pelo próximo nível; para as parcelas, aging_parcelas.',
  inputSchema: {
    ...FILTROS,
    lado: z.enum(['receber', 'pagar', 'ambos']).default('ambos'),
    por: z.array(z.enum(Object.keys(DIM))).min(1).max(3).default(['centro']).describe('Níveis do agrupamento, do mais geral ao mais detalhado.'),
    ordenar: z.enum(['vencido', 'a_vencer', 'total', 'atraso']).default('vencido'),
    faixas: z.enum(['resumo', 'todas', 'nenhuma']).default('resumo').describe('Valores por faixa em cada grupo: resumo (8 faixas), todas (15) ou nenhuma.'),
    limite: z.number().int().min(1).max(300).default(25).describe('Grupos no 1º nível.'),
    limite_sub: z.number().int().min(1).max(100).default(10).describe('Grupos em cada nível de baixo.'),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const { B, E, aplicado } = await montar(empresaId, a, ctx);
    const lados = a.lado === 'ambos' || !a.lado ? ['r', 'p'] : [LADO[a.lado]];
    const out = { cabecalho: cabecalho(B, aplicado), agrupado_por: (a.por || ['centro']).join(' › ') };
    lados.forEach((l) => {
      out[l === 'r' ? 'a_receber' : 'a_pagar'] = arvoreLado(E, l, a.por || ['centro'], a.ordenar || 'vencido', a.limite || 25, a.limite_sub || 10, a.faixas || 'resumo');
    });
    return out;
  }),
};

const parcelasTool = {
  name: 'aging_parcelas',
  description:
    'Lista os títulos/parcelas em aberto (o último nível da tela): título e parcela do Sienge (bill_id/installment_id), cliente ou ' +
    'fornecedor, documento, emissão, vencimento, dias de atraso, faixa, saldo corrigido e sem correção, valor original, rateio ' +
    '(centros e planos de contas), unidade, condição de pagamento e marcas (Inadimplente, Sub judice, Previsão). Filtre por faixa, ' +
    'atraso, título, texto, valor mínimo e os filtros da tela; ordene por atraso, valor ou vencimento.',
  inputSchema: {
    ...FILTROS,
    lado: z.enum(['receber', 'pagar', 'ambos']).default('ambos'),
    faixas: z.array(z.enum(IDS_FAIXA)).optional().describe(`Faixas: ${IDS_FAIXA.join(', ')} (v = vencido, h = hoje, a = a vencer).`),
    atraso_min_dias: z.number().int().optional().describe('Atraso mínimo em dias (negativo = a vencer; ex.: -7 = vence em até 7 dias).'),
    atraso_max_dias: z.number().int().optional(),
    titulo: z.number().int().optional().describe('Um título (bill_id) do Sienge.'),
    busca: z.string().optional().describe('Texto: nome, título, documento, unidade, centro ou plano de contas (como a busca da tela).'),
    valor_minimo: z.number().optional().describe('Só parcelas com valor no escopo a partir deste (R$).'),
    somente_inadimplentes: z.boolean().optional().describe('Só as marcadas como Inadimplente no Sienge (a receber).'),
    somente_sub_judice: z.boolean().optional(),
    ordenar: z.enum(['atraso', 'valor', 'vencimento']).default('atraso'),
    limite: z.number().int().min(1).max(500).default(50),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const { B, E, aplicado } = await montar(empresaId, a, ctx);
    let ls = E.linhas;
    if (a.lado && a.lado !== 'ambos') ls = ls.filter((x) => x.t.l === LADO[a.lado]);
    if (a.faixas?.length) {
      const s = indicesDasFaixas(a.faixas);
      ls = ls.filter((x) => s.has(x.t.fx));
    }
    if (a.atraso_min_dias !== undefined) ls = ls.filter((x) => x.t.atraso >= a.atraso_min_dias);
    if (a.atraso_max_dias !== undefined) ls = ls.filter((x) => x.t.atraso <= a.atraso_max_dias);
    if (a.titulo) ls = ls.filter((x) => x.t.b === a.titulo);
    if (a.somente_inadimplentes) ls = ls.filter((x) => x.t.ina);
    if (a.somente_sub_judice) ls = ls.filter((x) => x.t.sj);
    if (a.busca) ls = M.filtrarBusca(E, ls, a.busca);
    let lista = M.parcelas(ls);
    if (a.valor_minimo !== undefined) lista = lista.filter((p) => p.valor >= a.valor_minimo);
    if (a.ordenar === 'valor') lista.sort((x, y) => y.valor - x.valor);
    else if (a.ordenar === 'vencimento') lista.sort((x, y) => x.t.vn - y.t.vn || y.valor - x.valor);
    const total = M.soma(lista.map((p) => p.valor));
    const vencido = M.soma(lista.filter((p) => p.t.atraso > 0).map((p) => p.valor));
    const limite = a.limite || 50;
    return {
      cabecalho: cabecalho(B, aplicado),
      encontradas: lista.length,
      total: r2(total),
      vencido: r2(vencido),
      a_vencer: r2(total - vencido),
      ...(lista.length > limite ? { mostrando: `as ${limite} primeiras (ordem: ${a.ordenar || 'atraso'})` } : {}),
      parcelas: lista.slice(0, limite).map(({ t, valor, frac }) => ({
        lado: NOME_LADO[t.l],
        titulo: t.b,
        parcela: t.p,
        ...(t.pc ? { numero_parcela: t.pc } : {}),
        [t.l === 'r' ? 'cliente' : 'fornecedor']: M.nomePessoa(B, t.l, t.q),
        empresa: M.nomeEmpresa(B, t.c),
        documento: `${M.nomeDocumento(B, t.d)}${t.n ? ` ${t.n}` : ''}`,
        emissao: t.e ? M.dma(t.e) : null,
        vencimento: M.dma(t.v),
        dias_atraso: t.atraso,
        faixa: M.FAIXAS[t.fx].rotulo,
        valor_no_escopo: r2(valor),
        ...(frac < 0.999 ? { rateio_no_escopo_pct: pct1(frac) } : {}),
        saldo_corrigido: r2(t.s),
        saldo_sem_correcao: r2(t.o),
        valor_original: r2(t.vo),
        rateio: t.f.map(([c, n, fr]) => `${M.nomeCentro(B, c)} / ${M.nomeNatureza(B, n)}${t.f.length > 1 ? ` (${pct1(fr)}%)` : ''}`),
        ...(t.u ? { unidade: t.u } : {}),
        ...(t.cp ? { condicao: M.nomeCondicao(B, t.cp) } : {}),
        ...(t.ina || t.sj || t.pv ? { marcas: [t.ina ? 'Inadimplente' : null, t.sj ? 'Sub judice' : null, t.pv ? 'Previsão' : null].filter(Boolean) } : {}),
      })),
    };
  }),
};

const projecao = {
  name: 'aging_projecao_caixa',
  description:
    'Projeção do caixa integrando o saldo das contas bancárias (Saldo Contas Bancárias, último dia lançado) com o contas a ' +
    'receber e a pagar: dia a dia, recebe e paga o que vence (fim de semana na segunda), com cenários (previsto, conservador, ' +
    'estresse) e ajustes (não receber X%, atrasar recebimentos, recuperar vencido, aporte, saldo mínimo). Até 365 dias, por dia, ' +
    'semana ou mês. Parte do caixa livre (o Total geral da tela Saldo: Liberado + Limite cheque). Diz quando entra no cheque especial e quanto usa dele, ' +
    'quando falta caixa (saldo negativo, já sem cheque), o menor saldo e a necessidade de caixa. ' +
    'Com por_empresa=true, faz a projeção de cada SPE com o saldo das contas dela e mostra quais faltam caixa e quando. ' +
    'detalhar_dia lista as parcelas de um dia.',
  inputSchema: {
    ...FILTROS,
    horizonte_dias: z.number().int().min(1).max(365).default(15).describe('Dias projetados, contando hoje (a tela usa 15).'),
    agrupar: z.enum(['dia', 'semana', 'mes']).optional().describe('Padrão: dia até 31 dias, semana até 120, mês acima.'),
    ...CENARIO,
    por_empresa: z.boolean().optional().describe('Projeção de cada empresa (SPE) com o saldo das contas dela.'),
    detalhar_dia: dataSchema.optional().describe('Lista as entradas e saídas deste dia (AAAA-MM-DD).'),
    detalhar_partida: z.boolean().optional().describe('Lista as contas bancárias que formam o saldo de partida.'),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const { B, E, aplicado, inicio, fim } = await montar(empresaId, a, ctx);
    const horizonte = a.horizonte_dias || 15;
    const agruparPor = a.agrupar || (horizonte <= 31 ? 'dia' : horizonte <= 120 ? 'semana' : 'mes');
    const p = paramsSim(a, horizonte);
    const s = simulacao(E, p);
    const out = {
      cabecalho: cabecalho(B, aplicado),
      ...(inicio || fim
        ? { atencao: 'Há um período de vencimento no filtro: parcelas que vencem fora dele não entram na projeção. Para projetar tudo, não informe período.' }
        : {}),
      cenario: {
        nome: M.cenarioDe(p) ? M.CENARIOS[M.cenarioDe(p)].rotulo : 'personalizado',
        nao_receber_pct: p.naoReceber,
        atraso_recebimentos_dias: p.atrasoReceb,
        recuperar_vencido_pct: p.recuperar,
        permutas_nao_entram: p.semCaixa,
        partida: p.partida === 'total' ? 'caixa livre + bloqueado' : 'caixa livre (Total geral da tela Saldo: Liberado + Limite cheque)',
        ...(p.aporte ? { aporte: r2(p.aporte) } : {}),
        ...(p.minimo ? { saldo_minimo: r2(p.minimo) } : {}),
      },
      saldo_de_partida: { valor: r2(s.ini), ...partidaInfo(E.banco) },
      resumo: {
        dias: horizonte,
        ate: M.dma(s.dias.at(-1).data),
        entradas: r2(M.soma(s.dias.map((d) => d.ent))),
        saidas: r2(-M.soma(s.dias.map((d) => d.sai))),
        saldo_no_fim: r2(s.final),
        menor_saldo: r2(s.min),
        dia_do_menor_saldo: M.dma(s.minData),
        entra_no_cheque_especial_em: s.primeiroCheque ? M.dma(s.primeiroCheque) : null,
        maior_uso_do_cheque_especial: r2(s.usoCheque),
        dias_no_cheque_especial: s.diasNoCheque,
        falta_caixa_em: s.primeiroNegativo ? M.dma(s.primeiroNegativo) : null,
        dias_no_vermelho: s.diasNegativos,
        necessidade_de_caixa: r2(s.necessidade),
        vencido_a_receber_ate_90_dias: r2(s.sim.recuperavel),
        permutas_e_nao_cobrar_fora: r2(s.sim.semCaixa),
        situacao: situacaoTexto(s, !!E.banco.data, p.minimo),
      },
      [agruparPor === 'dia' ? 'dia_a_dia' : agruparPor === 'semana' ? 'por_semana' : 'por_mes']: serie(s.dias, agruparPor),
    };
    if (!a.detalhar_partida) delete out.saldo_de_partida.contas;
    else
      out.saldo_de_partida.contas = E.banco.lista.map((c) => ({
        conta: c.nome,
        empresa: M.curto(c.empresa),
        classificacao: c.classificacao,
        tipo_saldo: c.libera === true ? 'liberado' : c.libera === false ? 'bloqueado' : 'não informado',
        saldo: r2(c.saldo),
        ...(c.bloqueio ? { bloqueio: r2(c.bloqueio) } : {}),
        ...(c.limite ? { cheque_especial: r2(c.limite) } : {}),
      }));
    if (a.detalhar_dia) {
      const d = s.dias.find((x) => x.data === a.detalhar_dia);
      if (!d) throw falha(`O dia ${a.detalhar_dia} está fora do horizonte (${M.dma(s.dias[0].data)} a ${M.dma(s.dias.at(-1).data)}).`);
      const item = (it) =>
        it.extra
          ? { origem: 'Recuperação de vencidos a receber', valor: r2(it.valor) }
          : {
              [it.t.l === 'r' ? 'cliente' : 'fornecedor']: M.nomePessoa(B, it.t.l, it.t.q),
              titulo: `${it.t.b}/${it.t.p}`,
              documento: `${M.nomeDocumento(B, it.t.d)}${it.t.n ? ` ${it.t.n}` : ''}`,
              vencimento: M.dma(it.t.v),
              valor: r2(it.valor),
            };
      const ord = (x, y) => y.valor - x.valor;
      out.detalhe_do_dia = {
        dia: `${M.dma(d.data)} ${M.semana(d.n)}`,
        saldo_inicio: r2(d.ini),
        saldo_fim: r2(d.fim),
        entradas: d.itens.filter((x) => x.campo === 'ent').sort(ord).slice(0, 60).map(item),
        saidas: d.itens.filter((x) => x.campo === 'sai').sort(ord).slice(0, 60).map(item),
      };
    }
    if (a.por_empresa) {
      const ids = [...new Set([...E.linhas.map((x) => x.t.c), ...E.banco.lista.map((c) => c.company_id)])].filter((x) => x !== null && x !== undefined);
      out.por_empresa = ids
        .map((id) => {
          const linhas = E.linhas.filter((x) => x.t.c === id);
          const contas = E.banco.lista.filter((c) => c.company_id === id);
          const Ec = { ...E, linhas, banco: { data: E.banco.data, ...M.caixa(contas), lista: contas } };
          const sc = simulacao(Ec, { ...p, aporte: 0 });
          return {
            empresa: M.nomeEmpresa(B, id),
            company_id: id,
            caixa_livre_hoje: r2(Ec.banco.livre),
            ...(Ec.banco.cheque ? { dos_quais_cheque_especial: r2(Ec.banco.cheque) } : {}),
            entradas: r2(M.soma(sc.dias.map((d) => d.ent))),
            saidas: r2(-M.soma(sc.dias.map((d) => d.sai))),
            saldo_no_fim: r2(sc.final),
            menor_saldo: r2(sc.min),
            dia_do_menor_saldo: M.dma(sc.minData),
            entra_no_cheque_especial_em: sc.primeiroCheque ? M.dma(sc.primeiroCheque) : null,
            falta_caixa_em: sc.primeiroNegativo ? M.dma(sc.primeiroNegativo) : null,
          };
        })
        .filter((x) => x.entradas || x.saidas || x.caixa_livre_hoje)
        .sort((x, y) => x.menor_saldo - y.menor_saldo);
      out.leitura_por_empresa =
        'Cada SPE com o caixa livre das contas dela e as parcelas dela, sem transferência entre empresas. Ordenado do menor saldo para o maior: as primeiras são as que mais precisam de caixa.';
    }
    return out;
  }),
};

// Baixas já feitas (recebimentos / pagamentos do Sienge), com a fração do rateio quando há filtro de
// centro ou plano de contas. Só os tipos que movem dinheiro contam como recebido/pago; os demais
// (reparcelamento, distrato, substituição, cancelamento…) aparecem à parte.
const BAIXAS = {
  r: { tabela: 'sie_income_recebimentos', parcelas: 'sie_income', categorias: 'sie_income_categorias', pessoa: 'client', caixa: [2, 10], nomeCaixa: 'Recebimento' },
  p: { tabela: 'sie_outcome_pagamentos', parcelas: 'sie_outcome', categorias: 'sie_outcome_categorias', pessoa: 'creditor', caixa: [1, 10], nomeCaixa: 'Pagamento' },
};
// `pessoasFora` / `planosFora`: a lista é dos que ficam DE FORA (filtro salvo no "todos, menos").
async function baixas(empresaId, lado, { de, ate, pessoas, pessoasFora = false, empresas, centros, planos, planosFora = false }, agruparSql) {
  const t = BAIXAS[lado];
  const rateio = centros.length || planos.length;
  const params = [
    empresaId,
    de,
    ate,
    pessoas.length ? pessoas : null,
    empresas.length ? empresas : null,
    centros.length ? centros : null,
    planos.length ? planos : null,
    pessoasFora,
    planosFora,
  ];
  const { rows } = await pool.query(
    `SELECT ${agruparSql} AS grupo, b.operation_type_id AS tipo_id, b.operation_type_name AS tipo,
            sum(b.net_amount * f.frac) AS valor,
            sum(b.net_amount * f.frac) FILTER (WHERE b.payment_date <= i.due_date) AS em_dia,
            sum(b.net_amount * f.frac * GREATEST(b.payment_date - i.due_date, 0)) AS valor_x_atraso,
            sum(b.net_amount * f.frac) FILTER (WHERE b.payment_date - i.due_date > 30) AS mais_30,
            sum(b.net_amount * f.frac) FILTER (WHERE b.payment_date - i.due_date > 90) AS mais_90,
            count(*) AS n
       FROM ${t.tabela} b
       JOIN ${t.parcelas} i ON i.empresa_id = b.empresa_id AND i.bill_id = b.bill_id AND i.installment_id = b.installment_id
       ${
         rateio
           ? `JOIN LATERAL (
                SELECT COALESCE(sum(c.financial_category_rate) FILTER (WHERE ($6::bigint[] IS NULL OR c.cost_center_id = ANY($6::bigint[]))
                                                                        AND ($7::text[] IS NULL OR COALESCE(c.financial_category_id = ANY($7::text[]), false) <> $9::boolean)), 0)
                       / NULLIF(sum(c.financial_category_rate), 0) AS frac
                  FROM ${t.categorias} c WHERE c.empresa_id = i.empresa_id AND c.bill_id = i.bill_id AND c.installment_id = i.installment_id
              ) f ON f.frac > 0`
           : 'CROSS JOIN (SELECT 1::numeric AS frac) f'
       }
      WHERE b.empresa_id = $1 AND b.payment_date BETWEEN $2::date AND $3::date
        AND ($4::bigint[] IS NULL OR COALESCE(i.${t.pessoa}_id = ANY($4::bigint[]), false) <> $8::boolean)
        AND ($5::bigint[] IS NULL OR i.company_id = ANY($5::bigint[]))
        ${rateio ? '' : 'AND $6::bigint[] IS NULL AND $7::text[] IS NULL AND $9::boolean IS NOT NULL'}
      GROUP BY 1, 2, 3 ORDER BY 1, 2`,
    params
  );
  return rows.map((r) => ({ ...r, valor: Number(r.valor || 0), em_dia: Number(r.em_dia || 0), valor_x_atraso: Number(r.valor_x_atraso || 0), mais_30: Number(r.mais_30 || 0), mais_90: Number(r.mais_90 || 0), n: Number(r.n) }));
}

function resumoBaixas(rows, lado) {
  const caixa = rows.filter((r) => BAIXAS[lado].caixa.includes(Number(r.tipo_id)));
  const valor = M.soma(caixa.map((r) => r.valor));
  const emDia = M.soma(caixa.map((r) => r.em_dia));
  const xAtraso = M.soma(caixa.map((r) => r.valor_x_atraso));
  const atrasado = valor - emDia;
  const outros = new Map();
  rows
    .filter((r) => !BAIXAS[lado].caixa.includes(Number(r.tipo_id)))
    .forEach((r) => outros.set(r.tipo, (outros.get(r.tipo) || 0) + r.valor));
  return {
    [lado === 'r' ? 'recebido' : 'pago']: r2(valor),
    baixas: M.soma(caixa.map((r) => r.n)),
    em_dia_ou_antecipado: r2(emDia),
    pct_em_dia: pct1(valor ? emDia / valor : 0),
    com_atraso: r2(atrasado),
    atraso_medio_dias_do_atrasado: atrasado > 0 ? Math.round(xAtraso / atrasado) : 0,
    atraso_medio_dias_geral: valor > 0 ? Math.round((xAtraso / valor) * 10) / 10 : 0,
    [lado === 'r' ? 'recuperado_vencido_mais_30_dias' : 'pago_vencido_mais_30_dias']: r2(M.soma(caixa.map((r) => r.mais_30))),
    [lado === 'r' ? 'recuperado_vencido_mais_90_dias' : 'pago_vencido_mais_90_dias']: r2(M.soma(caixa.map((r) => r.mais_90))),
    ...(outros.size ? { baixas_sem_caixa: Object.fromEntries([...outros].map(([k, v]) => [k, r2(v)])) } : {}),
  };
}

const inadimplencia = {
  name: 'aging_inadimplencia',
  description:
    'Diagnóstico da inadimplência do contas a receber: carteira (vencido, a vencer, taxa de inadimplência = vencido ÷ total, ' +
    'vencido há mais de 90 dias, atraso médio ponderado, clientes inadimplentes), envelhecimento por faixa, por empreendimento ' +
    '(centro de custo), por condição de pagamento (financiamento, parcelas mensais, chaves…), maiores devedores, concentração, as ' +
    'parcelas marcadas como Inadimplente e Sub judice no Sienge e a recuperação recente (o que entrou de parcelas vencidas e a ' +
    'pontualidade dos recebimentos). Aceita os filtros da tela.',
  inputSchema: {
    ...FILTROS,
    top: z.number().int().min(3).max(50).default(10).describe('Quantos itens nos rankings.'),
    recuperacao_meses: z.number().int().min(1).max(24).default(3).describe('Janela da recuperação/pontualidade (meses até hoje).'),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const { B, E, f, aplicado, empresas } = await montar(empresaId, a, ctx);
    const top = a.top || 10;
    const ls = E.linhas.filter((x) => x.t.l === 'r');
    const pf = M.porFaixa(ls);
    const vencidas = ls.filter((x) => x.t.atraso > 0);
    const atrasoMedio = pf.vencido ? M.soma(vencidas.map((x) => x.valor * x.t.atraso)) / pf.vencido : 0;
    const marcadas = (campo) => {
      const v = ls.filter((x) => x.t[campo]);
      return { valor: r2(M.soma(v.map((x) => x.valor))), parcelas: new Set(v.map((x) => x.t)).size, clientes: new Set(v.map((x) => x.t.q)).size };
    };
    const porDim = (dim) =>
      M.arvore(E, ls, [dim], 'r', 'vencido')
        .filter((n) => n.vencido > 0)
        .slice(0, top)
        .map((n) => grupo(n, 'nenhuma'));
    const devedores = M.maiores(E, 'r', 'vencido', top);
    const condicoes = M.arvore(E, ls, ['condicao'], 'r', 'total').map((n) => grupo(n, 'nenhuma'));
    const hoje = B.hoje;
    const de = M.inicioDe(hoje, (a.recuperacao_meses || 3) - 1);
    const rows = await baixas(
      empresaId,
      'r',
      {
        de,
        ate: hoje,
        pessoas: f.clientes,
        pessoasFora: f.exceto.includes('clientes'),
        empresas,
        centros: f.centros,
        planos: f.naturezas,
        planosFora: f.exceto.includes('naturezas'),
      },
      "'periodo'"
    );
    return {
      cabecalho: cabecalho(B, aplicado),
      carteira: {
        total: r2(pf.total),
        vencido: r2(pf.vencido),
        a_vencer: r2(pf.aVencer),
        taxa_inadimplencia_pct: pct1(pf.total ? pf.vencido / pf.total : 0),
        vencido_mais_90_dias: r2(pf.fx[0] + pf.fx[1]),
        pct_do_vencido_com_mais_de_90_dias: pct1(pf.vencido ? (pf.fx[0] + pf.fx[1]) / pf.vencido : 0),
        atraso_medio_ponderado_dias: Math.round(atrasoMedio),
        parcelas_vencidas: new Set(vencidas.map((x) => x.t)).size,
        clientes_com_vencido: new Set(vencidas.map((x) => x.t.q)).size,
        clientes_na_carteira: pf.pessoas,
      },
      envelhecimento_do_vencido: M.FAIXAS.slice(0, M.IDX_HOJE).map((fx, i) => ({ faixa: fx.rotulo, valor: r2(pf.fx[i]), pct_do_vencido: pct1(pf.vencido ? pf.fx[i] / pf.vencido : 0) })),
      a_vencer_proximos: { hoje: r2(pf.fx[M.IDX_HOJE]), em_7_dias: r2(pf.fx[8]), de_8_a_30_dias: r2(pf.fx[9] + pf.fx[10]), de_31_a_90_dias: r2(pf.fx[11] + pf.fx[12]) },
      marcadas_no_sienge: { inadimplente: marcadas('ina'), sub_judice: marcadas('sj') },
      por_condicao_de_pagamento: condicoes,
      por_empreendimento_centro: porDim('centro'),
      por_empresa_spe: porDim('empresa'),
      maiores_devedores: {
        concentracao_pct: devedores.total ? Math.round(devedores.concentracao * 10) / 10 : null,
        lista: devedores.itens.map((x) => ({ cliente: x.nome, vencido: r2(x.valor), parcelas: x.parcelas, maior_atraso_dias: x.maiorAtraso })),
      },
      recuperacao_e_pontualidade: {
        janela: `${M.dma(de)} a ${M.dma(hoje)}`,
        ...resumoBaixas(rows, 'r'),
        leitura:
          'Recebido = baixas de recebimento (e adiantamento) no período. Em dia = pago até o vencimento. Recuperado de vencido = recebido com mais de 30/90 dias de atraso. Baixas sem caixa (reparcelamento, distrato, substituição…) à parte.',
      },
    };
  }),
};

const historico = {
  name: 'aging_historico_baixas',
  description:
    'O que já foi efetivamente recebido (contas a receber) ou pago (contas a pagar) no Sienge, por mês ou semana: valor, ' +
    'quanto foi em dia, com atraso, atraso médio, recuperado de vencido e as baixas sem dinheiro (reparcelamento, distrato, ' +
    'substituição, cancelamento). Opcionalmente os maiores clientes/fornecedores do período. Filtros: cliente/fornecedor, ' +
    'empresa (SPE), centro e plano de contas (pela fração do rateio).',
  inputSchema: {
    lado: z.enum(['receber', 'pagar']),
    meses: z.number().int().min(1).max(36).default(6).describe('Meses até hoje (o mês atual conta).'),
    agrupar: z.enum(['mes', 'semana']).default('mes'),
    centros: FILTROS.centros,
    empresas: FILTROS.empresas,
    planos_de_contas: FILTROS.planos_de_contas,
    clientes: FILTROS.clientes,
    fornecedores: FILTROS.fornecedores,
    top_pessoas: z.number().int().min(0).max(50).default(0).describe('Quantos maiores clientes/fornecedores do período listar (0 = nenhum).'),
  },
  handler: ferramenta(async (empresaId, a, ctx) => {
    const lado = LADO[a.lado];
    const { B, f, empresas, aplicado } = await montar(
      empresaId,
      { centros: a.centros, empresas: a.empresas, planos_de_contas: a.planos_de_contas, clientes: a.clientes, fornecedores: a.fornecedores },
      ctx
    );
    const hoje = B.hoje;
    const de = M.inicioDe(hoje, (a.meses || 6) - 1);
    const pessoas = lado === 'r' ? f.clientes : f.fornecedores;
    const filtros = { de, ate: hoje, pessoas, empresas, centros: f.centros, planos: f.naturezas };
    const sqlGrupo = a.agrupar === 'semana' ? "to_char(date_trunc('week', b.payment_date), 'YYYY-MM-DD')" : "to_char(b.payment_date, 'YYYY-MM')";
    const rows = await baixas(empresaId, lado, filtros, sqlGrupo);
    const grupos = [...new Set(rows.map((r) => r.grupo))].sort();
    const out = {
      cabecalho: { empresa: B.empresa, hoje: M.dma(hoje), lado: NOME_LADO[lado], periodo: `${M.dma(de)} a ${M.dma(hoje)}`, filtros: { ...aplicado, periodo_vencimento: undefined, previsoes_financeiras: undefined } },
      total: resumoBaixas(rows, lado),
      [a.agrupar === 'semana' ? 'por_semana' : 'por_mes']: grupos.map((g) => ({ [a.agrupar === 'semana' ? 'semana_de' : 'mes']: a.agrupar === 'semana' ? M.dma(g) : g, ...resumoBaixas(rows.filter((r) => r.grupo === g), lado) })),
    };
    if (a.top_pessoas) {
      const t = BAIXAS[lado];
      const { rows: tops } = await pool.query(
        `SELECT i.${t.pessoa}_name AS nome, sum(b.net_amount) AS valor, count(*) AS n,
                sum(b.net_amount * GREATEST(b.payment_date - i.due_date, 0)) / NULLIF(sum(b.net_amount), 0) AS atraso
           FROM ${t.tabela} b JOIN ${t.parcelas} i ON i.empresa_id = b.empresa_id AND i.bill_id = b.bill_id AND i.installment_id = b.installment_id
          WHERE b.empresa_id = $1 AND b.payment_date BETWEEN $2::date AND $3::date AND b.operation_type_id = ANY($4::int[])
            AND ($5::bigint[] IS NULL OR i.${t.pessoa}_id = ANY($5::bigint[])) AND ($6::bigint[] IS NULL OR i.company_id = ANY($6::bigint[]))
          GROUP BY 1 ORDER BY 2 DESC LIMIT $7`,
        [empresaId, de, hoje, t.caixa, pessoas.length ? pessoas : null, empresas.length ? empresas : null, a.top_pessoas]
      );
      out[lado === 'r' ? 'maiores_clientes' : 'maiores_fornecedores'] = tops.map((r) => ({
        nome: M.titulo(r.nome),
        valor: r2(Number(r.valor)),
        baixas: Number(r.n),
        atraso_medio_dias: Math.round(Number(r.atraso || 0) * 10) / 10,
      }));
      if (f.centros.length || f.naturezas.length) out.observacao_maiores = 'O ranking de maiores não aplica o filtro de centro/plano de contas (só pessoa e empresa).';
    }
    return out;
  }),
};

const TOOLS_AGING = [guia, painel, agrupar, parcelasTool, projecao, inadimplencia, historico];

module.exports = { TOOLS_AGING };
