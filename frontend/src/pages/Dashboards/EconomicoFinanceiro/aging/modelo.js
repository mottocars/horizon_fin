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

// Saldo das contas (o formato do backend) separado em caixa livre, bloqueado e crédito, como a tela
// Saldo Contas Bancárias: livre = contas de classificação liberada, menos o bloqueio registrado (pode
// ficar negativo se a conta está no vermelho); bloqueado = contas de classificação bloqueada + bloqueios
// registrados nas outras; cheque = limite do cheque especial das contas liberadas; total = todas.
export function caixa(contas) {
  const r = { livre: 0, bloqueado: 0, cheque: 0, total: 0, contas: contas.length };
  contas.forEach((c) => {
    r.total += c.saldo;
    if (c.libera === true) {
      r.livre += c.saldo - c.bloqueio;
      r.cheque += c.limite;
      r.bloqueado += c.bloqueio;
    } else if (c.libera === false) r.bloqueado += c.saldo;
    else r.bloqueado += c.bloqueio;
  });
  return r;
}

// ─── Filtros (barra e painel de filtros) ─────────────────────────────────────────────────────────
// O que um filtro salvo grava: o período em meses a partir do mês atual (`historico` para trás e
// `horizonte` para frente — o filtro acompanha o calendário), centros de custo, tipos de documento,
// plano de contas (`naturezas`), clientes (só no a receber), fornecedores (só no a pagar) e previsão
// financeira ('nao' = sem as previsões, o padrão; 'sim' = só elas; 'todos'). Listas vazias = sem filtro.
export const MAX_MESES = 360;
// Padrão do período: o ano atual inteiro (em outubro, 9 meses de histórico e 2 de horizonte).
export function periodoPadrao(hoje = new Date()) {
  const mes = hoje.getMonth() + 1;
  return { historico: mes - 1, horizonte: 12 - mes };
}
export const filtrosVazios = () => ({ centros: [], documentos: [], naturezas: [], clientes: [], fornecedores: [], previsao: 'nao', ...periodoPadrao() });
// Datas do período: do 1º dia do mês atual − histórico ao último dia do mês atual + horizonte.
export function periodoDe(hojeIso, historico, horizonte) {
  const a = +hojeIso.slice(0, 4);
  const m = +hojeIso.slice(5, 7) - 1;
  return {
    inicio: new Date(Date.UTC(a, m - historico, 1)).toISOString().slice(0, 10),
    fim: new Date(Date.UTC(a, m + horizonte + 1, 0)).toISOString().slice(0, 10),
  };
}
const LISTAS_FILTRO = ['centros', 'documentos', 'naturezas', 'clientes', 'fornecedores'];
const meses = (v, padrao) => (Number.isInteger(v) && v >= 0 && v <= MAX_MESES ? v : padrao);
export const normalizarFiltros = (f = {}) => {
  const p = periodoPadrao();
  return {
    historico: meses(f.historico, p.historico),
    horizonte: meses(f.horizonte, p.horizonte),
    ...Object.fromEntries(LISTAS_FILTRO.map((k) => [k, [...(f[k] || [])].sort()])),
    previsao: ['nao', 'sim', 'todos'].includes(f.previsao) ? f.previsao : 'nao',
  };
};
export const mesmosFiltros = (a, b) => JSON.stringify(normalizarFiltros(a)) === JSON.stringify(normalizarFiltros(b));
// Quantos filtros do painel estão valendo (o centro de custo fica na barra).
export const filtrosNoPainel = (f) => ['documentos', 'naturezas', 'clientes', 'fornecedores'].filter((k) => f[k]?.length).length + (f.previsao !== 'nao' ? 1 : 0);

// ─── Escopo dos filtros ──────────────────────────────────────────────────────────────────────────
// `inicio` / `fim` ('AAAA-MM-DD'): período do VENCIMENTO das parcelas; o resto, os filtros acima.
// Plano de contas e centro filtram cada fatia do rateio; os demais, a parcela inteira.
// Devolve as fatias (parcela × centro × natureza) no escopo e o saldo das contas — com centros
// marcados, só as contas das empresas (Sienge) desses centros.
export function escopo(B, { inicio = null, fim = null, ...filtros } = {}) {
  const f = { ...filtrosVazios(), ...filtros };
  const conj = (lista) => (lista.length ? new Set(lista) : null);
  const sel = conj(f.centros);
  const docs = conj(f.documentos);
  const planos = conj(f.naturezas.map(String)); // contas do plano de contas (só as de resultado)
  const clientes = conj(f.clientes);
  const fornecedores = conj(f.fornecedores);
  const linhas = [];
  B.titulos.forEach((t) => {
    if (f.previsao === 'nao' ? t.pv : f.previsao === 'sim' ? !t.pv : false) return;
    if ((inicio && t.v < inicio) || (fim && t.v > fim)) return;
    if (docs && !docs.has(t.d)) return;
    if (t.l === 'r' ? clientes && !clientes.has(t.q) : fornecedores && !fornecedores.has(t.q)) return;
    t.f.forEach(([centro, nat, frac]) => {
      if (sel && !sel.has(centro)) return;
      if (planos && !planos.has(nat)) return;
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
        ? ['em ', { b: dm(banco.data) }, ' · ', { b: brl(banco.cheque) }, ' de cheque especial · ', { b: brl(banco.bloqueado) }, ' bloqueado']
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
        : sim.min < -sim.cheque
          ? etiqueta('crit', 'Falta caixa')
          : sim.min < 0
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

// Árvore pelos níveis escolhidos (ex.: ['centro', 'natureza', 'pessoa']), do maior vencido para o
// menor (empate: maior total); embaixo do último nível, as parcelas (a mesma parcela em duas fatias do
// mesmo grupo vira uma linha só).
export function arvore(E, linhas, niveis, lado, caminho = '') {
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
      const filhos = resto.length ? () => (cache ||= arvore(E, ls, resto, lado, id)) : null;
      return { id, dim, chave: k, nome: D.nome(E.B, k, lado), linhas: ls, ...somar(ls), filhos };
    })
    .sort((a, b) => b.vencido - a.vencido || b.total - a.total);
}

// Parcelas de um grupo: soma as fatias da mesma parcela; mais vencidas primeiro, depois as que
// vencem antes.
export function parcelas(linhas) {
  const m = new Map();
  linhas.forEach((x) => {
    const r = m.get(x.t) || { t: x.t, valor: 0, frac: 0 };
    r.valor += x.valor;
    r.frac += x.frac;
    m.set(x.t, r);
  });
  return [...m.values()].sort((a, b) => b.t.atraso - a.t.atraso || b.valor - a.valor);
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
// - partida: 'livre' (contas liberadas, menos bloqueios) ou 'total' (todas as contas).
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
  let primeiroEstouro = null;
  dia.forEach((d) => {
    d.ini = saldo;
    saldo += d.ent - d.sai;
    d.fim = saldo;
    if (saldo < min) {
      min = saldo;
      minData = d.data;
    }
    if (saldo < 0 && !primeiroNegativo) primeiroNegativo = d.data;
    if (saldo < -banco.cheque && !primeiroEstouro) primeiroEstouro = d.data;
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
    primeiroEstouro,
    necessidade: Math.max(0, -min), // para o caixa não ficar negativo
    diasNegativos: dia.filter((d) => d.fim < 0).length,
    recuperavel,
    semCaixa,
  };
}
