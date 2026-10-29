// Modelo do Aging List (dashboard Econômico Financeiro) sobre os dados da rota
// /dashboards/economico-financeiro/aging (backend dashboards/agingPainel.service.js): faixas de
// vencimento, escopo dos filtros, agrupamentos do detalhamento, indicadores e o simulador de caixa dos
// próximos dias. Tudo no navegador — os filtros e o simulador recalculam a cada clique.
// Valor de cada parcela = saldo CORRIGIDO em aberto; com rateio, cada fatia (centro × natureza) leva a
// fração dela. "Atraso" = dias de hoje até o vencimento (positivo = vencido; 0 = vence hoje).
import { brl, nf0, pct, soma, titulo, curto } from '../fluxo/modelo';

export { brl, nf0, pct, soma, titulo, curto };

// ─── Datas (dias corridos em UTC) ────────────────────────────────────────────────────────────────
const DIA = 864e5;
export const diaNum = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d) / DIA;
};
export const isoDe = (n) => new Date(n * DIA).toISOString().slice(0, 10);
const diaSemana = (n) => new Date(n * DIA).getUTCDay(); // 0 = domingo, 6 = sábado
export const fimDeSemana = (n) => [0, 6].includes(diaSemana(n));
// Vencimento no sábado ou domingo cai no banco na segunda-feira.
export const diaUtil = (n) => (diaSemana(n) === 6 ? n + 2 : diaSemana(n) === 0 ? n + 1 : n);
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const semana = (n) => SEMANA[diaSemana(n)];
// 'AAAA-MM-DD' -> 'dd/mm' e 'dd/mm/aa'.
export const dm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '–');
export const dma = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '–');
const dias = (n) => `${nf0.format(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;

// ─── Faixas ──────────────────────────────────────────────────────────────────────────────────────
// Da mais vencida à mais distante; grupo v = vencido, h = vence hoje, a = a vencer.
export const FAIXAS = [
  { id: 'v180', grupo: 'v', curto: '+180', rotulo: 'Vencido há mais de 180 dias', min: 181, max: Infinity },
  { id: 'v91', grupo: 'v', curto: '91–180', rotulo: 'Vencido de 91 a 180 dias', min: 91, max: 180 },
  { id: 'v61', grupo: 'v', curto: '61–90', rotulo: 'Vencido de 61 a 90 dias', min: 61, max: 90 },
  { id: 'v31', grupo: 'v', curto: '31–60', rotulo: 'Vencido de 31 a 60 dias', min: 31, max: 60 },
  { id: 'v16', grupo: 'v', curto: '16–30', rotulo: 'Vencido de 16 a 30 dias', min: 16, max: 30 },
  { id: 'v8', grupo: 'v', curto: '8–15', rotulo: 'Vencido de 8 a 15 dias', min: 8, max: 15 },
  { id: 'v1', grupo: 'v', curto: '1–7', rotulo: 'Vencido de 1 a 7 dias', min: 1, max: 7 },
  { id: 'h', grupo: 'h', curto: 'Hoje', rotulo: 'Vence hoje', min: 0, max: 0 },
  { id: 'a1', grupo: 'a', curto: '1–7', rotulo: 'Vence em 1 a 7 dias', min: -7, max: -1 },
  { id: 'a8', grupo: 'a', curto: '8–15', rotulo: 'Vence em 8 a 15 dias', min: -15, max: -8 },
  { id: 'a16', grupo: 'a', curto: '16–30', rotulo: 'Vence em 16 a 30 dias', min: -30, max: -16 },
  { id: 'a31', grupo: 'a', curto: '31–60', rotulo: 'Vence em 31 a 60 dias', min: -60, max: -31 },
  { id: 'a61', grupo: 'a', curto: '61–90', rotulo: 'Vence em 61 a 90 dias', min: -90, max: -61 },
  { id: 'a91', grupo: 'a', curto: '91–180', rotulo: 'Vence em 91 a 180 dias', min: -180, max: -91 },
  { id: 'a180', grupo: 'a', curto: '+180', rotulo: 'Vence em mais de 180 dias', min: -Infinity, max: -181 },
];
export const NF = FAIXAS.length;
export const IDX_HOJE = FAIXAS.findIndex((f) => f.id === 'h');
export const faixaDe = (atraso) => FAIXAS.findIndex((f) => atraso >= f.min && atraso <= f.max);


// Condições de pagamento que não viram dinheiro no banco (simulador).
export const SEM_CAIXA = /PERMUTA|N[AÃ]O COBRAR/i;

// ─── Preparação ──────────────────────────────────────────────────────────────────────────────────
// Marca em cada parcela o atraso e a faixa (uma vez por carga).
export function preparar(d) {
  if (!d?.titulos) return null;
  const h = diaNum(d.hoje);
  d.titulos.forEach((t) => {
    t.vn = diaNum(t.v);
    t.atraso = h - t.vn;
    t.fx = faixaDe(t.atraso);
  });
  // Nome de cada conta do plano de contas: o do cadastro (Plano de Contas), se vier; senão o do rateio.
  (d.catalogos?.planos || []).forEach((p) => {
    if (p.nome) d.naturezas[p.id] = p.nome;
  });
  return { ...d, h, centroPorId: new Map(d.centros.map((c) => [c.id, c])) };
}

export const nomeCentro = (B, id) => (id === null || id === undefined ? 'Sem centro de custo' : titulo(B.centroPorId.get(id)?.nome || `Centro ${id}`));
// Plano de contas (a natureza financeira do rateio do Sienge).
export const nomeNatureza = (B, id) => (id === null || id === undefined ? 'Sem plano de contas' : titulo(B.naturezas[id] || id));
export const nomePessoa = (B, lado, id) => (id === null || id === undefined ? 'Sem nome' : titulo(B.pessoas[lado]?.[id] || `Código ${id}`));
export const nomeEmpresa = (B, id) => (id === null || id === undefined ? 'Sem empresa' : curto(B.empresas[id] || `Empresa ${id}`));
export const nomeCondicao = (B, id) => (id ? titulo(B.condicoes[id] || id) : 'Sem condição');
export const nomeDocumento = (B, id) => (id ? titulo(B.documentos[id] || id) : 'Sem documento');
export const rotuloPessoa = (lado, plural = false) => (lado === 'r' ? (plural ? 'clientes' : 'Cliente') : plural ? 'fornecedores' : 'Fornecedor');

// Saldo das contas (o formato do backend) com a regra do Resumo dos saldos da tela Saldo Contas
// Bancárias (backend/.../saldo-contas-bancarias/resumoSaldos.calculo.js — mudou lá, muda aqui):
// - livre = o Total liberado, tudo o que dá para usar no dia: nas contas de classificação liberada,
//   saldo menos o bloqueio registrado (só a parte positiva) + o limite restante do cheque especial
//   (saldo negativo já sai do limite: -200 com limite 500 -> 300);
// - cheque = quanto do livre é cheque especial (os limites restantes das contas liberadas);
// - bloqueado = contas de classificação bloqueada + bloqueios registrados nas outras;
// - total = livre + bloqueado.
export function caixa(contas) {
  const c100 = (v) => Math.round(Number(v) * 100);
  let livre = 0;
  let cheque = 0;
  let bloqueado = 0;
  contas.forEach((c) => {
    const saldo = c100(c.saldo);
    const bloqueio = c100(c.bloqueio);
    const restante = c.limite > 0 ? c100(c.limite) + Math.min(saldo, 0) : 0;
    if (c.libera === true) {
      livre += Math.max(saldo - bloqueio, 0) + restante;
      cheque += restante;
    }
    bloqueado += c.libera === false ? saldo : bloqueio;
  });
  return { livre: livre / 100, cheque: cheque / 100, bloqueado: bloqueado / 100, total: (livre + bloqueado) / 100, contas: contas.length };
}

// ─── Filtros (barra e painel de filtros) ─────────────────────────────────────────────────────────
// O período (Início e Fim) fica na barra. O filtro salvo grava o período em meses a partir do mês
// atual — `historico` para trás e `horizonte` para frente (painel de filtros) — e, ao ser aplicado,
// recalcula o Início e o Fim: o filtro acompanha o calendário. null = o filtro não mexe naquele lado do
// período. Grava também centros de custo, tipos de documento, plano de contas (`naturezas`), clientes
// (só no a receber), fornecedores (só no a pagar) e previsão financeira ('nao' = sem as previsões, o
// padrão; 'sim' = só elas; 'todos'). Listas vazias = sem filtro.
// `exceto`: as listas do painel no modo "Marcar todos" — nelas a lista guarda os DESMARCADOS (todos,
// menos esses; o que aparecer depois no Sienge entra). Modo "todos" sem nenhum desmarcado = sem filtro.
export const MAX_MESES = 360;
export const LISTAS_PAINEL = ['documentos', 'naturezas', 'clientes', 'fornecedores'];
export const filtrosVazios = () => ({ centros: [], documentos: [], naturezas: [], clientes: [], fornecedores: [], exceto: [], previsao: 'nao' });

// Período padrão: o ano atual inteiro.
export const periodoPadrao = (hojeIso) => ({ inicio: `${hojeIso.slice(0, 4)}-01-01`, fim: `${hojeIso.slice(0, 4)}-12-31` });
const mesNum = (iso) => +iso.slice(0, 4) * 12 + +iso.slice(5, 7) - 1;
const isoMes = (n, dia) => new Date(Date.UTC(Math.floor(n / 12), n % 12, dia)).toISOString().slice(0, 10);
// Início = 1º dia do mês atual − histórico; Fim = último dia do mês atual + horizonte.
export const inicioDe = (hojeIso, historico) => isoMes(mesNum(hojeIso) - historico, 1);
export const fimDe = (hojeIso, horizonte) => isoMes(mesNum(hojeIso) + horizonte + 1, 0);
// O contrário: os meses que um Início/Fim representam — null quando a data não é o começo (fim) de um
// mês ou fica do outro lado do mês atual.
export function mesesDoPeriodo(hojeIso, inicio, fim) {
  const historico = mesNum(hojeIso) - mesNum(inicio);
  const horizonte = mesNum(fim) - mesNum(hojeIso);
  return {
    historico: inicio.slice(8) === '01' && historico >= 0 && historico <= MAX_MESES ? historico : null,
    horizonte: fim === fimDe(fim, 0) && horizonte >= 0 && horizonte <= MAX_MESES ? horizonte : null,
  };
}

const LISTAS_FILTRO = ['centros', ...LISTAS_PAINEL];
const meses = (v) => (Number.isInteger(v) && v >= 0 && v <= MAX_MESES ? v : null);
// "Todos" sem nenhum desmarcado = sem filtro: some do `exceto` (grava e compara igual a não filtrar).
export const normalizarFiltros = (f = {}) => ({
  historico: meses(f.historico),
  horizonte: meses(f.horizonte),
  ...Object.fromEntries(LISTAS_FILTRO.map((k) => [k, [...(f[k] || [])].sort()])),
  exceto: LISTAS_PAINEL.filter((k) => f.exceto?.includes(k) && f[k]?.length),
  previsao: ['nao', 'sim', 'todos'].includes(f.previsao) ? f.previsao : 'nao',
});
export const mesmosFiltros = (a, b) => JSON.stringify(normalizarFiltros(a)) === JSON.stringify(normalizarFiltros(b));
// Quantos filtros do painel estão valendo (o centro de custo fica na barra).
export const filtrosNoPainel = (f) => LISTAS_PAINEL.filter((k) => f[k]?.length).length + (f.previsao !== 'nao' ? 1 : 0);

// ─── Escopo dos filtros ──────────────────────────────────────────────────────────────────────────
// `inicio` / `fim` ('AAAA-MM-DD'): período do VENCIMENTO das parcelas; o resto, os filtros acima.
// Plano de contas e centro filtram cada fatia do rateio; os demais, a parcela inteira.
// Devolve as fatias (parcela × centro × natureza) no escopo e o saldo das contas — com centros
// marcados, só as contas das empresas (Sienge) desses centros.
export function escopo(B, { inicio = null, fim = null, ...filtros } = {}) {
  const f = { ...filtrosVazios(), ...filtros };
  const conj = (lista) => (lista.length ? new Set(lista) : null);
  // Lista do painel: fica de fora o que não está marcado — no modo "todos" (`exceto`), o que foi desmarcado.
  const fora = (k, conv = (v) => v) => {
    const s = conj(f[k].map(conv));
    if (!s) return null;
    return f.exceto?.includes(k) ? (v) => s.has(v) : (v) => !s.has(v);
  };
  const sel = conj(f.centros);
  const docs = fora('documentos');
  const planos = fora('naturezas', String); // contas do plano de contas (só as de resultado)
  const clientes = fora('clientes');
  const fornecedores = fora('fornecedores');
  const linhas = [];
  B.titulos.forEach((t) => {
    if (f.previsao === 'nao' ? t.pv : f.previsao === 'sim' ? !t.pv : false) return;
    if ((inicio && t.v < inicio) || (fim && t.v > fim)) return;
    if (docs && docs(t.d)) return;
    if (t.l === 'r' ? clientes && clientes(t.q) : fornecedores && fornecedores(t.q)) return;
    t.f.forEach(([centro, nat, frac]) => {
      if (sel && !sel.has(centro)) return;
      if (planos && planos(nat)) return;
      linhas.push({ t, centro, nat, frac, valor: t.s * frac });
    });
  });
  let contas = B.bancos.contas;
  if (sel) {
    const cos = new Set([...sel].map((id) => B.centroPorId.get(id)?.company_id).filter((x) => x !== null && x !== undefined));
    contas = contas.filter((c) => cos.has(c.company_id));
  }
  return { B, linhas, banco: { data: B.bancos.data, ...caixa(contas), lista: contas }, filtrado: !!sel };
}

// Soma por faixa de um conjunto de fatias: { fx: [15], total, vencido, n (parcelas), pessoas }.
export function porFaixa(linhas) {
  const fx = new Array(NF).fill(0);
  const tit = new Set();
  const pes = new Set();
  linhas.forEach((x) => {
    fx[x.t.fx] += x.valor;
    tit.add(x.t);
    pes.add(x.t.q);
  });
  const vencido = soma(fx.slice(0, IDX_HOJE));
  return { fx, total: soma(fx), vencido, aVencer: soma(fx.slice(IDX_HOJE)), n: tit.size, pessoas: pes.size };
}
const doLado = (linhas, lado) => linhas.filter((x) => x.t.l === lado);
// Atraso médio ponderado pelo valor (só o vencido): Σ valor × dias ÷ Σ valor.
function atrasoMedio(linhas) {
  let v = 0;
  let p = 0;
  linhas.forEach((x) => {
    if (x.t.atraso > 0) {
      v += x.valor;
      p += x.valor * x.t.atraso;
    }
  });
  return v > 0 ? p / v : 0;
}

// ─── Indicadores (8 cards) ───────────────────────────────────────────────────────────────────────
const etiqueta = (tom, texto) => ({ tom, texto });
export const HORIZONTE_CARDS = 15;

export function indicadores(E) {
  const { linhas, banco } = E;
  const out = {};
  ['r', 'p'].forEach((lado) => {
    const ls = doLado(linhas, lado);
    const a = porFaixa(ls);
    const ate = (n) => soma(ls.filter((x) => x.t.atraso <= 0 && x.t.atraso > -n).map((x) => x.valor));
    out[lado] = {
      ...a,
      mais90: a.fx[0] + a.fx[1], // +180 e 91–180
      atrasoMedio: atrasoMedio(ls),
      hoje: a.fx[IDX_HOJE],
      d7: ate(7),
      d15: ate(HORIZONTE_CARDS),
      n15: new Set(ls.filter((x) => x.t.atraso <= 0 && x.t.atraso > -HORIZONTE_CARDS).map((x) => x.t)).size,
    };
  });
  const sim = simular(E, { ...CENARIOS.previsto, horizonte: HORIZONTE_CARDS });
  const { r, p } = out;
  const pctV = (x) => (x.total > 0 ? (x.vencido / x.total) * 100 : 0);
  const tomVenc = (v) => (v > 15 ? 'crit' : v > 5 ? 'warn' : 'good');
  return [
    {
      chave: 'receber',
      titulo: 'A receber em aberto',
      valor_fmt: brl(r.total),
      detalhe: [{ b: nf0.format(r.n) }, ' parcelas · ', { b: nf0.format(r.pessoas) }, ' clientes'],
      etiqueta: r.total ? etiqueta(tomVenc(pctV(r)), `${pct(pctV(r))} vencido`) : etiqueta('info', 'Sem parcelas'),
    },
    {
      chave: 'receber_vencido',
      titulo: 'Vencido a receber',
      valor_fmt: brl(r.vencido),
      detalhe: r.vencido ? [{ b: brl(r.mais90) }, ' há mais de 90 dias · atraso médio ', { b: dias(Math.round(r.atrasoMedio)) }] : ['nenhuma parcela vencida'],
      etiqueta: !r.vencido
        ? etiqueta('good', 'Em dia')
        : r.mais90 / r.vencido > 0.5
          ? etiqueta('crit', 'Atraso crônico')
          : etiqueta('warn', 'Cobrar'),
    },
    {
      chave: 'receber_prox',
      titulo: `Entra nos próximos ${HORIZONTE_CARDS} dias`,
      valor_fmt: brl(r.d15),
      detalhe: [{ b: brl(r.hoje) }, ' hoje · ', { b: brl(r.d7) }, ' em 7 dias'],
      etiqueta: etiqueta('info', `${nf0.format(r.n15)} parcelas`),
    },
    {
      chave: 'caixa',
      titulo: 'Caixa livre hoje',
      valor_fmt: banco.data ? brl(banco.livre) : '–',
      detalhe: banco.data
        ? ['em ', { b: dm(banco.data) }, ...(banco.cheque ? [' · inclui ', { b: brl(banco.cheque) }, ' de cheque especial'] : [' · sem cheque especial'])]
        : ['sem saldo lançado em Saldo Contas Bancárias'],
      etiqueta: banco.data ? etiqueta(banco.livre < 0 ? 'crit' : 'info', `${banco.contas} contas`) : etiqueta('warn', 'Sem saldo'),
    },
    {
      chave: 'pagar',
      titulo: 'A pagar em aberto',
      valor_fmt: brl(p.total),
      detalhe: [{ b: nf0.format(p.n) }, ' parcelas · ', { b: nf0.format(p.pessoas) }, ' fornecedores'],
      etiqueta: p.total ? etiqueta(tomVenc(pctV(p)), `${pct(pctV(p))} vencido`) : etiqueta('info', 'Sem parcelas'),
    },
    {
      chave: 'pagar_vencido',
      titulo: 'Vencido a pagar',
      valor_fmt: brl(p.vencido),
      detalhe: p.vencido ? [{ b: brl(p.mais90) }, ' há mais de 90 dias · atraso médio ', { b: dias(Math.round(p.atrasoMedio)) }] : ['nenhuma parcela vencida'],
      etiqueta: !p.vencido
        ? etiqueta('good', 'Em dia')
        : p.mais90 / p.vencido > 0.7
          ? etiqueta('warn', 'Atraso antigo: revisar')
          : etiqueta('crit', 'Pagamentos atrasados'),
    },
    {
      chave: 'pagar_prox',
      titulo: `Sai nos próximos ${HORIZONTE_CARDS} dias`,
      valor_fmt: brl(p.d15),
      detalhe: [{ b: brl(p.hoje) }, ' hoje · ', { b: brl(p.d7) }, ' em 7 dias'],
      etiqueta: etiqueta('info', `${nf0.format(p.n15)} parcelas`),
    },
    {
      chave: 'minimo',
      titulo: `Menor saldo · ${HORIZONTE_CARDS} dias`,
      valor_fmt: brl(sim.min),
      detalhe: [...(banco.data ? [] : ['partindo de zero · ']), 'em ', { b: dm(sim.minData) }, ' · fecha com ', { b: brl(sim.final) }],
      etiqueta: !banco.data
        ? etiqueta('warn', 'Sem saldo de partida')
        : sim.min < 0
          ? etiqueta('crit', 'Falta caixa')
          : sim.min < sim.cheque
            ? etiqueta('warn', 'Usa cheque especial')
            : etiqueta('good', 'Caixa cobre'),
    },
  ];
}

// ─── Escada de vencimentos (faixas lado a lado) ──────────────────────────────────────────────────
// Por faixa: a receber, a pagar, líquido e — de hoje em diante — o caixa acumulado se tudo acontecer
// no vencimento (caixa livre de hoje + líquido acumulado das faixas a vencer).
export function escada(E) {
  const r = porFaixa(doLado(E.linhas, 'r'));
  const p = porFaixa(doLado(E.linhas, 'p'));
  let acum = E.banco.data ? E.banco.livre : 0;
  const linhas = FAIXAS.map((f, i) => {
    const liq = r.fx[i] - p.fx[i];
    if (i >= IDX_HOJE) acum += liq;
    return { ...f, i, r: r.fx[i], p: p.fx[i], liq, acum: i >= IDX_HOJE ? acum : null };
  });
  // Escala das barras: as faixas das pontas (+180) costumam ser muito maiores (financiamentos longos,
  // pendências antigas) e achatariam o resto — a escala é a das faixas do meio e as pontas que passam
  // dela aparecem cortadas.
  const meio = linhas.filter((l) => l.id !== 'v180' && l.id !== 'a180').flatMap((l) => [l.r, l.p]);
  return {
    linhas,
    r,
    p,
    escala: Math.max(1, ...meio),
    vencidoLiq: r.vencido - p.vencido,
    trintaLiq: soma(linhas.filter((l) => l.i >= IDX_HOJE && l.i <= 10).map((l) => l.liq)),
    posicao: r.total - p.total,
  };
}

// ─── Detalhamento (árvore) ───────────────────────────────────────────────────────────────────────
export const DIMENSOES = {
  centro: { rotulo: () => 'Centro de custo', chave: (x) => x.centro, nome: (B, k) => nomeCentro(B, k) },
  natureza: { rotulo: () => 'Plano de contas', chave: (x) => x.nat, nome: (B, k) => nomeNatureza(B, k) },
  pessoa: { rotulo: (lado) => rotuloPessoa(lado), chave: (x) => x.t.q, nome: (B, k, lado) => nomePessoa(B, lado, k) },
  empresa: { rotulo: () => 'Empresa', chave: (x) => x.t.c, nome: (B, k) => nomeEmpresa(B, k) },
  condicao: { rotulo: () => 'Condição de pagamento', soReceber: true, chave: (x) => x.t.cp ?? null, nome: (B, k) => nomeCondicao(B, k) },
  documento: { rotulo: () => 'Tipo de documento', chave: (x) => x.t.d ?? null, nome: (B, k) => nomeDocumento(B, k) },
};
export const dimensoesDoLado = (lado) => Object.keys(DIMENSOES).filter((k) => lado === 'r' || !DIMENSOES[k].soReceber);

function somar(linhas) {
  const fx = new Array(NF).fill(0);
  const tit = new Set();
  let vencidoDias = 0;
  linhas.forEach((x) => {
    fx[x.t.fx] += x.valor;
    tit.add(x.t);
    if (x.t.atraso > 0) vencidoDias += x.valor * x.t.atraso;
  });
  const vencido = soma(fx.slice(0, IDX_HOJE));
  return { fx, total: soma(fx), vencido, n: tit.size, atrasoMedio: vencido > 0 ? vencidoDias / vencido : 0 };
}

// Ordem do detalhamento ("Ordenar por"): maior vencido, maior a vencer ou maior total (empate: maior total).
export const ORDENS = [
  ['vencido', 'Vencido'],
  ['avencer', 'A vencer'],
  ['total', 'Total'],
];
const aVencerDe = (x) => x.total - x.vencido;
const COMPARA = {
  vencido: (a, b) => b.vencido - a.vencido || b.total - a.total,
  avencer: (a, b) => aVencerDe(b) - aVencerDe(a) || b.total - a.total,
  total: (a, b) => b.total - a.total,
};

// Árvore pelos níveis escolhidos (ex.: ['centro', 'natureza', 'pessoa']), na `ordem` escolhida;
// embaixo do último nível, as parcelas (a mesma parcela em duas fatias do mesmo grupo vira uma linha só).
export function arvore(E, linhas, niveis, lado, ordem = 'vencido', caminho = '') {
  if (!niveis.length) return null;
  const [dim, ...resto] = niveis;
  const D = DIMENSOES[dim];
  const grupos = new Map();
  linhas.forEach((x) => {
    const k = D.chave(x);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(x);
  });
  return [...grupos]
    .map(([k, ls]) => {
      const id = `${caminho}/${dim}:${k}`;
      let cache = null; // os filhos só são montados quando o grupo é aberto
      const filhos = resto.length ? () => (cache ||= arvore(E, ls, resto, lado, ordem, id)) : null;
      return { id, dim, chave: k, nome: D.nome(E.B, k, lado), linhas: ls, ...somar(ls), filhos };
    })
    .sort(COMPARA[ordem] || COMPARA.vencido);
}

// Parcelas de um grupo: soma as fatias da mesma parcela. Por vencido: as mais atrasadas primeiro; por a
// vencer: as a vencer primeiro, da que vence antes; por total: do maior valor para o menor.
export function parcelas(linhas, ordem = 'vencido') {
  const m = new Map();
  linhas.forEach((x) => {
    const r = m.get(x.t) || { t: x.t, valor: 0, frac: 0 };
    r.valor += x.valor;
    r.frac += x.frac;
    m.set(x.t, r);
  });
  const lista = [...m.values()];
  if (ordem === 'total') return lista.sort((a, b) => b.valor - a.valor);
  if (ordem === 'avencer') return lista.sort((a, b) => (a.t.atraso > 0) - (b.t.atraso > 0) || a.t.vn - b.t.vn || b.valor - a.valor);
  return lista.sort((a, b) => b.t.atraso - a.t.atraso || b.valor - a.valor);
}

// Busca do detalhamento: nome do cliente/fornecedor, título, documento, unidade, centro ou plano de contas.
export function filtrarBusca(E, linhas, termo) {
  const q = termo
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (!q) return linhas;
  const norm = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
  const cache = new Map();
  return linhas.filter((x) => {
    const k = `${x.t.l}|${x.t.b}|${x.t.p}|${x.centro}|${x.nat}`;
    if (!cache.has(k)) {
      const B = E.B;
      cache.set(
        k,
        norm(
          [B.pessoas[x.t.l]?.[x.t.q], x.t.b, `${x.t.b}/${x.t.p}`, x.t.n, x.t.u, B.centroPorId.get(x.centro)?.nome, x.centro, B.naturezas[x.nat], x.nat, B.empresas[x.t.c]].join(' ')
        ).includes(q)
      );
    }
    return cache.get(k);
  });
}

// ─── Maiores devedores / credores ────────────────────────────────────────────────────────────────
// `quais`: 'vencido' | 'prox30' (vence de hoje a 30 dias).
export function maiores(E, lado, quais, n = 10) {
  const ls = doLado(E.linhas, lado).filter((x) => (quais === 'vencido' ? x.t.atraso > 0 : x.t.atraso <= 0 && x.t.atraso > -30));
  const total = soma(ls.map((x) => x.valor));
  const m = new Map();
  ls.forEach((x) => {
    const r = m.get(x.t.q) || { q: x.t.q, valor: 0, tit: new Set(), maiorAtraso: 0, proximo: Infinity };
    r.valor += x.valor;
    r.tit.add(x.t);
    r.maiorAtraso = Math.max(r.maiorAtraso, x.t.atraso);
    r.proximo = Math.min(r.proximo, x.t.vn);
    m.set(x.t.q, r);
  });
  const top = [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, n);
  return {
    total,
    pessoas: m.size,
    concentracao: total > 0 ? (soma(top.map((x) => x.valor)) / total) * 100 : 0,
    itens: top.map((x) => ({ ...x, nome: nomePessoa(E.B, lado, x.q), parcelas: x.tit.size, proximo: Number.isFinite(x.proximo) ? isoDe(x.proximo) : null })),
  };
}

// ─── Simulador de caixa dos próximos dias ────────────────────────────────────────────────────────
// Parte do saldo das contas de hoje (Saldo Contas Bancárias) e, dia a dia, recebe e paga o que vence
// (fim de semana cai na segunda); o vencido a pagar não entra. Ajustes do cenário (só nos recebimentos):
// - naoReceber: % das entradas previstas que não entra;
// - atrasoReceb: dias de atraso nos recebimentos;
// - recuperar: % do vencido a receber de até 90 dias que entra, dividido pelos dias úteis do período;
// - semCaixa: permutas e "Não cobrar" não entram no banco;
// - partida: 'livre' (o Total liberado, com o cheque especial dentro) ou 'total' (liberado + bloqueado).
// Como o cheque especial já está no saldo de partida, saldo negativo = falta caixa; abaixo do valor do
// cheque (`cheque`) = o caixa próprio acabou e o cheque especial está sendo usado.
export const CENARIOS = {
  previsto: { rotulo: 'Previsto', naoReceber: 0, atrasoReceb: 0, recuperar: 0 },
  conservador: { rotulo: 'Conservador', naoReceber: 10, atrasoReceb: 5, recuperar: 0 },
  estresse: { rotulo: 'Estresse', naoReceber: 30, atrasoReceb: 10, recuperar: 0 },
};
export const PADRAO_SIM = { ...CENARIOS.previsto, horizonte: 15, partida: 'livre', semCaixa: true };
const CHAVES_CENARIO = ['naoReceber', 'atrasoReceb', 'recuperar'];
export const cenarioDe = (p) => Object.keys(CENARIOS).find((k) => CHAVES_CENARIO.every((c) => CENARIOS[k][c] === p[c])) || null;

export function simular(E, params) {
  const p = { ...PADRAO_SIM, ...params };
  const { B, banco } = E;
  const h = B.h;
  const N = p.horizonte;
  const fim = h + N - 1;
  const ini = banco.data ? (p.partida === 'total' ? banco.total : banco.livre) : 0;
  const dia = Array.from({ length: N }, (_, i) => ({ n: h + i, data: isoDe(h + i), util: !fimDeSemana(h + i), ent: 0, sai: 0, itens: [] }));
  const lancar = (n, campo, valor, item) => {
    if (n < h || n > fim || !valor) return;
    const d = dia[n - h];
    d[campo] += valor;
    if (item) d.itens.push({ ...item, campo, valor });
  };
  const uteis = dia.filter((d) => d.util);
  const fatorR = 1 - p.naoReceber / 100;
  let recuperavel = 0;
  let semCaixa = 0;

  E.linhas.forEach((x) => {
    const { t } = x;
    if (t.l === 'r') {
      if (p.semCaixa && t.cp && SEM_CAIXA.test(B.condicoes[t.cp] || '')) {
        if (t.atraso <= 0 && t.vn <= fim) semCaixa += x.valor;
        return;
      }
      if (t.atraso > 0) {
        if (t.atraso <= 90) recuperavel += x.valor;
        return;
      }
      lancar(diaUtil(diaUtil(t.vn) + p.atrasoReceb), 'ent', x.valor * fatorR, { t, frac: x.frac, nominal: x.valor });
    } else if (t.atraso <= 0) {
      lancar(diaUtil(t.vn), 'sai', x.valor, { t, frac: x.frac, nominal: x.valor });
    }
  });
  // Recuperação do vencido a receber, dividida pelos dias úteis.
  const rec = recuperavel * (p.recuperar / 100);
  if (rec && uteis.length) uteis.forEach((d) => lancar(d.n, 'ent', rec / uteis.length, { extra: 'recuperacao', nominal: rec / uteis.length }));

  let saldo = ini;
  let min = Infinity;
  let minData = null;
  let primeiroNegativo = null;
  let primeiroCheque = null;
  dia.forEach((d) => {
    d.ini = saldo;
    saldo += d.ent - d.sai;
    d.fim = saldo;
    if (saldo < min) {
      min = saldo;
      minData = d.data;
    }
    if (saldo < 0 && !primeiroNegativo) primeiroNegativo = d.data;
    if (banco.cheque > 0 && saldo < banco.cheque && !primeiroCheque) primeiroCheque = d.data;
  });
  return {
    p,
    ini,
    dias: dia,
    entradas: soma(dia.map((d) => d.ent)),
    saidas: soma(dia.map((d) => d.sai)),
    final: saldo,
    min,
    minData,
    cheque: banco.cheque,
    primeiroNegativo,
    primeiroCheque,
    usoCheque: Math.min(banco.cheque, Math.max(0, banco.cheque - min)), // o máximo do cheque especial usado
    necessidade: Math.max(0, -min), // para o caixa não ficar negativo (já usando todo o cheque especial)
    diasNegativos: dia.filter((d) => d.fim < 0).length,
    diasNoCheque: banco.cheque > 0 ? dia.filter((d) => d.fim < banco.cheque).length : 0,
    recuperavel,
    semCaixa,
  };
}
