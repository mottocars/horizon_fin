// Modelo do Detalhamento Financeiro (dashboard Econômico Financeiro) sobre os dados da rota
// /dashboards/economico-financeiro/detalhamento (backend dashboards/detalhamentoPainel.service.js), no período
// Início–Fim:
// - REALIZADO: cada lançamento do extrato das contas com "Projeta DFC", no rateio do realizado do DFC;
// - EM ABERTO: as parcelas do Aging List que vencem no período (saldo corrigido, sem previsões);
// - TOTAL = realizado + em aberto — o resultado do período se tudo o que está em aberto acontecer.
// Entradas = contas a receber (recebido e a receber) + créditos do banco sem título; saídas = contas a pagar
// (pago e a pagar) + débitos do banco sem título (tarifas…). A movimentação entre contas (transferências e
// aplicações/resgates — Máscara DFC 2 de CFG.interno) fica de fora de tudo: é dinheiro trocando de conta, não
// entrando nem saindo da empresa. A inicialização de saldo do Sienge também (não é fluxo).
import { brl, eixo, lbl, nf0, pct, soma, titulo } from '../fluxo/modelo';
import { diaNum, dm, dma } from '../aging/modelo';

export { brl, dm, dma, eixo, lbl, nf0, pct, soma, titulo };

// Ajuste aqui se o plano de máscaras do DFC mudar (DFC Construtoras › Máscaras, nível 2).
export const CFG = { interno: /TRANSFER|RESGATE/i };

export const ORIGENS = { CR: 'Contas a receber', CP: 'Contas a pagar', BC: 'Lançamento bancário', CX: 'Caixa' };
export const nomeOrigem = (o) => ORIGENS[o] || `Origem ${o}`;
export const TIPOS = { R: 'Realizado', A: 'Em aberto' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function rotuloPeriodo(de, ate) {
  const a = de.slice(0, 7);
  const b = ate.slice(0, 7);
  const mes = (m) => MESES[+m.slice(5, 7) - 1];
  if (a === b) return `${mes(a)}/${a.slice(2, 4)}`;
  return a.slice(0, 4) === b.slice(0, 4) ? `${mes(a)} a ${mes(b)}/${b.slice(2, 4)}` : `${mes(a)}/${a.slice(2, 4)} a ${mes(b)}/${b.slice(2, 4)}`;
}
export const periodoPadrao = (hojeIso) => ({ inicio: `${hojeIso.slice(0, 4)}-01-01`, fim: `${hojeIso.slice(0, 4)}-12-31` });

// ─── Preparação (uma vez por carga) ──────────────────────────────────────────────────────────────
// Cada fatia (realizada ou em aberto) vira { tipo: 'R'|'A', lado: 'e'|'s', valor (com sinal), centro, nat,
// m2, L (lançamento) | T (parcela), mes, data, interno }.
export function preparar(d) {
  if (!d?.lancamentos) return null;
  const n2 = new Map();
  d.mascaras.forEach((g, gi) =>
    g.filhos.forEach((f, fi) => n2.set(f.id, { id: f.id, nome: titulo(f.descricao), grupo: titulo(g.descricao), ordem: gi * 1000 + fi, interno: CFG.interno.test(f.descricao) }))
  );
  const h = diaNum(d.hoje);
  const pecas = [];
  d.lancamentos.forEach((L) => {
    L.mes = L.d.slice(0, 7);
    L.conta = d.contas[L.k] || null;
    L.lp = L.o === 'CR' ? 'r' : L.o === 'CP' ? 'p' : null; // lado da pessoa
    L.v = soma(L.f.map((x) => x[2]));
    if (L.ini) return;
    L.f.forEach(([centro, nat, valor, m2]) => {
      const M = m2 === null || m2 === undefined ? null : n2.get(m2) || null;
      // Lado pela origem (como no Aging: receber × pagar); sem título, pelo sinal.
      const lado = L.o === 'CR' ? 'e' : L.o === 'CP' ? 's' : valor >= 0 ? 'e' : 's';
      pecas.push({ tipo: 'R', L, lado, valor, centro, nat, m2: M, mes: L.mes, data: L.d, interno: !!M?.interno });
    });
  });
  d.abertos.forEach((T) => {
    T.atraso = h - diaNum(T.v); // positivo = vencido
    const sinal = T.l === 'r' ? 1 : -1;
    T.f.forEach(([centro, nat, frac, m2]) => {
      const M = m2 === null || m2 === undefined ? null : n2.get(m2) || null;
      pecas.push({ tipo: 'A', T, lado: T.l === 'r' ? 'e' : 's', valor: T.s * frac * sinal, frac, centro, nat, m2: M, mes: T.v.slice(0, 7), data: T.v, interno: !!M?.interno });
    });
  });
  return { ...d, h, n2, pecas, centroPorId: new Map(d.centros.map((c) => [c.id, c])) };
}

export const nomeCentro = (B, id) => (id === null || id === undefined ? 'Sem centro de custo' : titulo(B.centroPorId.get(id)?.nome || `Centro ${id}`));
export const codigoPlano = (B, id) => (id === null || id === undefined ? '' : B.planos[id]?.[0] || String(id));
export const nomePlano = (B, id) => (id === null || id === undefined ? 'Sem plano de contas' : titulo(B.planos[id]?.[1] || `Conta ${id}`));
// Cliente ou fornecedor da fatia; lançamento do banco sem título fica num grupo próprio.
export const ladoPessoa = (x) => (x.tipo === 'A' ? x.T.l : x.L.lp);
const qDe = (x) => (x.tipo === 'A' ? x.T.q : x.L.q);
export function nomePessoa(B, x) {
  const l = ladoPessoa(x);
  if (!l) return x.L.o === 'CX' ? 'Caixa (sem título)' : 'Lançamento bancário (sem título)';
  const q = qDe(x);
  return q === undefined || q === null ? 'Título sem cliente/fornecedor' : titulo(B.pessoas[l]?.[q] || `Código ${q}`);
}
export const nomeDocumento = (B, id) => (id ? titulo(B.documentos?.[id] || id) : '');
export const nomeMascara = (x) => (x.m2 ? x.m2.nome : 'Sem máscara no DFC');

// ─── Escopo (centro de custo) ────────────────────────────────────────────────────────────────────
// Só as fatias dos centros marcados (vazio = todos), sem a movimentação entre contas — que vem à parte.
export function escopo(B, { centros = [] } = {}) {
  const sel = centros.length ? new Set(centros) : null;
  const pecas = [];
  const internas = { R: 0, A: 0, bruto: 0 };
  B.pecas.forEach((x) => {
    if (sel && !sel.has(x.centro)) return;
    if (x.interno) {
      internas[x.tipo] += x.valor;
      internas.bruto += Math.abs(x.valor);
    } else pecas.push(x);
  });
  return { B, P: B.periodo, pecas, internas, filtrado: !!sel };
}

// ─── Resumo: entradas, saídas e resultado × realizado, em aberto e total ─────────────────────────
export function resumo(E) {
  const vazio = () => ({ e: 0, s: 0, ne: new Set(), ns: new Set(), vencE: 0, vencS: 0 });
  const t = { R: vazio(), A: vazio() };
  E.pecas.forEach((x) => {
    const o = t[x.tipo];
    const item = x.L || x.T;
    if (x.lado === 'e') {
      o.e += x.valor;
      o.ne.add(item);
      if (x.tipo === 'A' && x.T.atraso > 0) o.vencE += x.valor;
    } else {
      o.s += x.valor;
      o.ns.add(item);
      if (x.tipo === 'A' && x.T.atraso > 0) o.vencS += x.valor;
    }
  });
  const linha = (o) => ({ e: o.e, s: o.s, res: o.e + o.s, ne: o.ne.size, ns: o.ns.size, vencE: o.vencE, vencS: o.vencS });
  const R = linha(t.R);
  const A = linha(t.A);
  return { R, A, T: { e: R.e + A.e, s: R.s + A.s, res: R.res + A.res, ne: R.ne + A.ne, ns: R.ns + A.ns } };
}

// ─── Mês a mês ───────────────────────────────────────────────────────────────────────────────────
// Por mês do período: entradas e saídas realizadas e em aberto (o em aberto no mês do vencimento — o vencido
// aparece no mês em que venceu), o resultado do mês e o acumulado.
export function mensal(E) {
  const ms = [];
  for (let m = E.P.de.slice(0, 7); m <= E.P.ate.slice(0, 7) && ms.length < 240; ) {
    ms.push(m);
    const [a, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
  }
  const por = new Map(ms.map((m) => [m, { mes: m, eR: 0, sR: 0, eA: 0, sA: 0 }]));
  E.pecas.forEach((x) => {
    const r = por.get(x.mes);
    if (!r) return;
    r[`${x.lado}${x.tipo}`] += x.valor;
  });
  let acum = 0;
  const mesHoje = isoMes(E.B.hoje);
  return ms.map((m) => {
    const r = por.get(m);
    const res = r.eR + r.sR + r.eA + r.sA;
    acum += res;
    return { ...r, res, acum, atual: m === mesHoje, futuro: m > mesHoje };
  });
}
const isoMes = (iso) => iso.slice(0, 7);

// ─── De onde veio e para onde foi cada real (Sankey) ─────────────────────────────────────────────
// Pelo LÍQUIDO de cada Máscara DFC 2 nas fatias do `tipo` ('R', 'A' ou 'T' = os dois): máscara com
// líquido positivo é fonte; negativo, destino (com as contas do plano de contas que mais pesam ao lado).
// Fatia sem máscara entra pela conta do plano de contas (empresa que ainda não classificou o plano no DFC).
// Sobra = o que ficou; falta = o que saiu do caixa que já existia.
const MIN_FONTE = 0.012;
const MIN_DETALHE = 0.006;
export function fluxoDoDinheiro(E, tipo = 'R') {
  const B = E.B;
  const porM2 = new Map();
  E.pecas.forEach((x) => {
    if (tipo !== 'T' && x.tipo !== tipo) return;
    const k = x.m2 ? x.m2.id : `p${x.nat}`;
    const r = porM2.get(k) || { m2: x.m2, nat0: x.nat, liq: 0, nat: new Map() };
    r.liq += x.valor;
    r.nat.set(x.nat, (r.nat.get(x.nat) || 0) + x.valor);
    porM2.set(k, r);
  });
  const nome = (r) => (r.m2 ? r.m2.nome : nomePlano(B, r.nat0));
  const fontes = [];
  const usos = [];
  porM2.forEach((r, k) => {
    if (r.liq > 0.5) fontes.push({ id: `f${k}`, rotulo: nome(r), valor: r.liq, receita: /OPERACIONAL/i.test(r.m2?.grupo || ''), grupo: r.m2?.grupo || '' });
    else if (r.liq < -0.5) {
      const filhos = [...r.nat.entries()].filter(([, v]) => v < -0.5).map(([nat, v]) => ({ id: `n${nat}`, rotulo: nomePlano(B, nat), valor: -v }));
      usos.push({ id: `u${k}`, rotulo: nome(r), grupo: r.m2?.grupo || '', valor: -r.liq, filhos: filhos.length > 1 ? filhos : [] });
    }
  });
  const entradas = soma(fontes.map((f) => f.valor));
  const saidas = soma(usos.map((u) => u.valor));
  if (entradas <= 0 && saidas <= 0) return null;
  const resultado = entradas - saidas;
  const base = Math.max(entradas, saidas);
  fontes.sort((p, q) => q.valor - p.valor);
  const pequenas = fontes.filter((f) => f.valor < base * MIN_FONTE);
  const col0 =
    pequenas.length >= 2
      ? [...fontes.filter((f) => f.valor >= base * MIN_FONTE), { id: 'outras', rotulo: 'Outras entradas', valor: soma(pequenas.map((f) => f.valor)), itens: pequenas }]
      : fontes;
  if (resultado < -0.5) col0.push({ id: 'prejuizo', rotulo: 'Saiu do caixa que já existia', valor: -resultado, tipo: 'prejuizo' });
  usos.sort((p, q) => q.valor - p.valor);
  const col2 = usos.map((u) => ({ ...u }));
  if (resultado > 0.5) col2.push({ id: 'resultado', rotulo: 'Sobrou', valor: resultado, tipo: 'lucro', filhos: [] });
  const col3 = [];
  col2.forEach((u) => {
    if (!u.filhos?.length) return;
    const ord = [...u.filhos].sort((p, q) => q.valor - p.valor);
    const peq = ord.filter((f) => f.valor < base * MIN_DETALHE);
    const lista = peq.length >= 2 ? [...ord.filter((f) => f.valor >= base * MIN_DETALHE), { id: `d${u.id}`, rotulo: 'Demais', valor: soma(peq.map((f) => f.valor)), itens: peq }] : ord;
    lista.forEach((f) => col3.push({ ...f, id: `${u.id}-${f.id}`, pai: u.id }));
  });
  return {
    entradas: base, // o Sankey mede tudo pelo bloco do meio
    totalEntradas: entradas,
    saidas,
    resultado,
    centro: { id: 'centro', rotulo: resultado < -0.5 ? 'Entradas + caixa usado' : 'Total das entradas', valor: base },
    col0,
    col2,
    col3,
  };
}
export function deCada100(F) {
  if (!F || !F.totalEntradas) return [];
  return F.col2.map((u) => ({ id: u.id, rotulo: u.rotulo, valor: (u.valor / F.totalEntradas) * 100, tipo: u.tipo || null }));
}

// ─── Detalhamento (árvore, como no Aging List) ───────────────────────────────────────────────────
const chavePessoa = (x) => {
  const l = ladoPessoa(x);
  return l ? `${l}:${qDe(x) ?? '?'}` : `b:${x.L.o}`;
};
export const DIMENSOES = {
  centro: { rotulo: 'Centro de custo', chave: (x) => x.centro, nome: (B, k) => nomeCentro(B, k) },
  natureza: { rotulo: 'Plano de contas', chave: (x) => x.nat, nome: (B, k) => (k === null ? 'Sem plano de contas' : `${codigoPlano(B, k)} · ${nomePlano(B, k)}`) },
  pessoa: { rotulo: 'Cliente / fornecedor', chave: chavePessoa, nome: (B, k, x) => nomePessoa(B, x) },
  mascara: { rotulo: 'Máscara DFC', chave: (x) => (x.m2 ? x.m2.id : 'fora'), nome: (B, k, x) => nomeMascara(x), ordem: (B, k) => B.n2.get(k)?.ordem ?? 1e9 },
  mes: { rotulo: 'Mês', chave: (x) => x.mes, nome: (B, k) => lbl(k), cronologico: true },
};
export const ORDENS = [
  ['total', 'Total'],
  ['realizado', 'Realizado'],
  ['aberto', 'Em aberto'],
];
const COMPARA = {
  total: (a, b) => Math.abs(b.total) - Math.abs(a.total),
  realizado: (a, b) => Math.abs(b.r) - Math.abs(a.r) || Math.abs(b.total) - Math.abs(a.total),
  aberto: (a, b) => Math.abs(b.a) - Math.abs(a.a) || Math.abs(b.total) - Math.abs(a.total),
};
function somar(ls) {
  let r = 0;
  let a = 0;
  let venc = 0;
  const nr = new Set();
  const na = new Set();
  ls.forEach((x) => {
    if (x.tipo === 'R') {
      r += x.valor;
      nr.add(x.L);
    } else {
      a += x.valor;
      na.add(x.T);
      if (x.T.atraso > 0) venc += x.valor;
    }
  });
  return { r, a, total: r + a, venc, nr: nr.size, na: na.size };
}

// Árvore pelos níveis (ex.: ['centro', 'natureza', 'pessoa']); embaixo do último nível, os lançamentos
// realizados e as parcelas em aberto (as fatias do mesmo lançamento/parcela viram uma linha só).
export function arvore(E, linhas, niveis, ordem = 'total', caminho = '') {
  if (!niveis.length) return null;
  const [dim, ...resto] = niveis;
  const D = DIMENSOES[dim];
  const grupos = new Map();
  linhas.forEach((x) => {
    const k = D.chave(x);
    if (!grupos.has(k)) grupos.set(k, { x, ls: [] });
    grupos.get(k).ls.push(x);
  });
  const nos = [...grupos.entries()].map(([k, { x, ls }]) => {
    const id = `${caminho}/${dim}:${k}`;
    let cache = null;
    const filhos = resto.length ? () => (cache ||= arvore(E, ls, resto, ordem, id)) : null;
    return { id, dim, chave: k, nome: D.nome(E.B, k, x), linhas: ls, ...somar(ls), filhos };
  });
  if (D.cronologico) return nos.sort((p, q) => String(p.chave).localeCompare(String(q.chave)));
  if (D.ordem && ordem === 'total') return nos.sort((p, q) => D.ordem(E.B, p.chave) - D.ordem(E.B, q.chave));
  return nos.sort(COMPARA[ordem] || COMPARA.total);
}

// Itens de um grupo: realizados (por data) e em aberto (por vencimento), na ordem escolhida.
export function itensDe(linhas, ordem = 'total') {
  const m = new Map();
  linhas.forEach((x) => {
    const k = x.L || x.T;
    const r = m.get(k) || { x, valor: 0, frac: 0 };
    r.valor += x.valor;
    r.frac += x.tipo === 'A' ? x.frac : x.L.v ? x.valor / x.L.v : 1;
    m.set(k, r);
  });
  const lista = [...m.values()];
  if (ordem === 'realizado') return lista.sort((a, b) => (b.x.tipo === 'R') - (a.x.tipo === 'R') || Math.abs(b.valor) - Math.abs(a.valor));
  if (ordem === 'aberto') return lista.sort((a, b) => (b.x.tipo === 'A') - (a.x.tipo === 'A') || Math.abs(b.valor) - Math.abs(a.valor));
  return lista.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
}

// Busca: cliente/fornecedor, título, documento, descrição, centro ou plano de contas.
const sem = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
export function filtrarBusca(E, linhas, termo) {
  const q = sem(termo.trim());
  if (!q) return linhas;
  const B = E.B;
  const cache = new Map();
  return linhas.filter((x) => {
    const item = x.L || x.T;
    const k = `${x.tipo}|${x.tipo === 'R' ? item.i : `${item.l}${item.b}/${item.p}`}|${x.centro}|${x.nat}`;
    if (!cache.has(k)) {
      cache.set(
        k,
        sem([nomePessoa(B, x), item.b !== undefined ? `${item.b}/${item.p}` : '', item.n, item.doc, item.ds, item.u, nomeCentro(B, x.centro), codigoPlano(B, x.nat), nomePlano(B, x.nat), nomeMascara(x)].join(' ')).includes(q)
      );
    }
    return cache.get(k);
  });
}
