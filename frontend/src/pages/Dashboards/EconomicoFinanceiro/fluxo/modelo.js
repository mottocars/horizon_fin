// Modelo do painel do Fluxo de Caixa — porte do model()/scenario() do painel do CFO de referência
// (C:\Users\motta\Desktop\layout\painel-cfo.html), sobre os dados da rota
// /dashboards/economico-financeiro/fluxo-caixa (backend dashboards/fluxoCaixaPainel.service.js).

// ─── Configuração (ajuste aqui se o plano de máscaras mudar) ──────────────────────────────────────
export const CFG = {
  operacional: /OPERACIONAL/i, // máscara nível 1 do fluxo operacional
  obra: /CONSTRU|OBRA/i, // máscara 2 de custo de obra
  overhead: /PESSOAL|ADMINISTRATIV/i, // estrutura fixa
  socios: /SOCIO/i, // distribuição aos sócios
  vendas: /RECEITA DE VENDAS/i, // receita de vendas
  investimento: /INVEST/i, // tipo da conta corrente = aplicação (aba Contas Correntes)
};

// ─── Formatos ────────────────────────────────────────────────────────────────────────────────────
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function brl(v, sinal) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  const a = Math.abs(v);
  const s = a >= 1e6 ? `R$ ${nf2.format(a / 1e6)} mi` : a >= 1e3 ? `R$ ${nf0.format(a / 1e3)} mil` : `R$ ${nf0.format(a)}`;
  return (v < 0 ? '−' : sinal && v > 0 ? '+' : '') + s;
}
export function eixo(v) {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${nf1.format(a / 1e6).replace(',0', '')} mi` : a >= 1e3 ? `${nf0.format(a / 1e3)} mil` : nf0.format(a);
  return (v < 0 ? '−' : '') + s;
}
export const pct = (v, sinal) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : (sinal && v > 0 ? '+' : '') + `${nf1.format(v)}%`);
export const soma = (a) => a.reduce((x, y) => x + (+y || 0), 0);
export const media = (a) => (a.length ? soma(a) / a.length : 0);
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function addM(m, k) {
  let y = +m.slice(0, 4);
  let mo = +m.slice(5, 7) - 1 + k;
  y += Math.floor(mo / 12);
  mo = ((mo % 12) + 12) % 12;
  return `${y}-${String(mo + 1).padStart(2, '0')}`;
}
export const lbl = (m) => (m ? `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}` : '–');
export function titulo(s) {
  return String(s || '')
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w) || !w) return w;
      if (!/[aeiouáéíóúâêôãõà]/i.test(w) && /\p{L}/u.test(w)) return w.toUpperCase();
      const l = w.toLowerCase();
      if (i > 0 && /^(de|da|do|das|dos|e|em)$/.test(l)) return l;
      return l.replace(/^(\(?)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    })
    .join('');
}
// "TOSTES 05 EMPREENDIMENTOS IMOBILIARIOS SPE LTDA" -> "Tostes 05".
export const curto = (s) => titulo(String(s || '').replace(/\s+(EMPREENDIMENTOS|CONSTRU[ÇC][ÕO]ES).*$/i, '').trim());
export function niceTicks(min, max, n) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const t = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) t.push(Math.round(v));
  return t;
}

// ─── Modelo derivado ─────────────────────────────────────────────────────────────────────────────
// `d`: resposta da rota; `ids`: centros do filtro (null = todos).
export function modelo(d, ids) {
  if (!d?.fluxo) return null;
  const { m0, fluxo } = d;
  const meses = [];
  for (let m = d.meses.ini; m <= d.meses.fim; m = addM(m, 1)) meses.push(m);
  const hist = meses.filter((m) => m < m0);
  const fut = meses.filter((m) => m >= m0);
  const get = (pc, m, t) => +(pc?.[`${m}|${t}`] || 0);

  // Máscara 1 › entradas/saídas › máscara 2.
  const m2s = [];
  let opEnt = null;
  let opSai = null;
  fluxo.estrutura.forEach((n1) => {
    const op = CFG.operacional.test(n1.descricao);
    n1.lados.forEach((l) => {
      const lado = l.chave === 'S' ? 'sai' : 'ent';
      if (op) {
        if (lado === 'ent') opEnt = l.porColuna;
        else opSai = l.porColuna;
      }
      l.filhos.forEach((n2) => m2s.push({ m1: n1.descricao, lado, nome: n2.descricao, pc: n2.porColuna, op }));
    });
  });
  const op = m2s.filter((x) => x.op);
  const linha = (re, ld) => op.filter((x) => re.test(x.nome) && (!ld || x.lado === ld));
  const serie = (rows, m, t) => soma(rows.map((r) => get(r.pc, m, t)));
  const fimDe = (m) => (m < m0 ? get(fluxo.saldoFinal, m, 'R') : get(fluxo.saldoFinal, m, 'P'));
  const socios = m2s.filter((x) => CFG.socios.test(x.nome) && x.lado === 'sai');

  const D = {
    m0,
    meses,
    hist,
    fut,
    caixaHoje: get(fluxo.saldoInicial, m0, 'R') || get(fluxo.saldoInicial, m0, 'P'),
    saldoHist: hist.map(fimDe),
    saldoFut: fut.map(fimDe),
    resFut: fut.map((m) => get(fluxo.resultado, m, 'P')),
    entR: hist.map((m) => get(opEnt, m, 'R')),
    saiR: hist.map((m) => get(opSai, m, 'R')),
    entPh: hist.map((m) => get(opEnt, m, 'P')),
    saiPh: hist.map((m) => get(opSai, m, 'P')),
    entP: fut.map((m) => get(opEnt, m, 'P')),
    saiP: fut.map((m) => get(opSai, m, 'P')),
    overheadR: hist.map((m) => serie(linha(CFG.overhead, 'sai'), m, 'R')),
    overheadP: fut.map((m) => serie(linha(CFG.overhead, 'sai'), m, 'P')),
    obraP: fut.map((m) => serie(linha(CFG.obra, 'sai'), m, 'P')),
    vendasP: fut.map((m) => serie(linha(CFG.vendas, 'ent'), m, 'P')),
    sociosR: hist.map((m) => serie(socios, m, 'R')),
    sociosP: fut.map((m) => serie(socios, m, 'P')),
    calib: op
      .map((x) => ({ nome: titulo(x.nome), lado: x.lado, r: soma(hist.map((m) => get(x.pc, m, 'R'))), p: soma(hist.map((m) => get(x.pc, m, 'P'))) }))
      .filter((c) => Math.abs(c.r) + Math.abs(c.p) > 0),
  };
  // Fechamento do último mês realizado = abertura do mês atual (regra do DFC).
  if (D.saldoHist.length) D.saldoHist[D.saldoHist.length - 1] = D.caixaHoje || D.saldoHist.at(-1);
  D.colchao = -media(D.saiP);
  D.overheadRun = -media(D.overheadR.slice(-6));
  const minV = D.saldoFut.length ? Math.min(...D.saldoFut) : 0;
  D.minBase = minV;
  D.minIdx = Math.max(0, D.saldoFut.indexOf(minV));

  // Centros: realizado e projetado operacional por mês.
  const noFiltro = (id) => !ids || ids.includes(+id);
  const cmap = Object.fromEntries((d.centros || []).map((c) => [c.id, c]));
  const por = {};
  const add = (r, base) => {
    if (!noFiltro(r.id)) return;
    const p = (por[r.id] = por[r.id] || { id: r.id, R: {}, P: {} });
    p[base][r.mes] = { ent: r.ent || 0, sai: r.sai || 0, cap: r.captacao || 0 };
  };
  (d.real || []).forEach((r) => add(r, 'R'));
  (d.proj || []).forEach((r) => add(r, 'P'));
  D.centros = Object.values(por)
    .map((p) => {
      const c = cmap[p.id] || { nome: `Centro ${p.id}` };
      const lr = soma(hist.map((m) => (p.R[m]?.ent || 0) + (p.R[m]?.sai || 0)));
      const lp = soma(fut.map((m) => (p.P[m]?.ent || 0) + (p.P[m]?.sai || 0)));
      const capR = soma(hist.map((m) => p.R[m]?.cap || 0));
      const capP = soma(fut.map((m) => p.P[m]?.cap || 0));
      return {
        id: p.id,
        nome: titulo(c.nome),
        company_id: c.company_id,
        company: c.company_name,
        contrato: c.contrato,
        param: c.param_versao,
        projeta: c.projeta_dfc,
        lr,
        lp,
        capR,
        capP,
        entP: fut.map((m) => p.P[m]?.ent || 0),
        liqP: fut.map((m) => (p.P[m]?.ent || 0) + (p.P[m]?.sai || 0)),
      };
    })
    .filter((c) => Math.abs(c.lr) + Math.abs(c.lp) > 1);

  // Empresas (SPE): caixa das contas + fluxo operacional projetado dos seus centros.
  D.contas = d.contas || [];
  const cos = {};
  const empresa = (k, nome) => (cos[k] = cos[k] || { id: k, nome, caixa: 0, liq: fut.map(() => 0), centros: [] });
  D.contas.forEach((c) => (empresa(c.company_id ?? c.empresa, c.empresa).caixa += c.saldo));
  D.centros.forEach((c) => {
    const o = empresa(c.company_id, c.company);
    c.liqP.forEach((v, i) => (o.liq[i] += v));
    o.centros.push(c.nome);
  });
  const empresasDoFiltro = ids ? new Set((d.centros || []).filter((c) => ids.includes(c.id)).map((c) => c.company_id)) : null;
  D.spes = Object.values(cos)
    .filter((o) => !empresasDoFiltro || empresasDoFiltro.has(o.id))
    .map((o) => {
      let b = o.caixa;
      const path = o.liq.map((v) => (b += v));
      const zi = path.findIndex((v) => v < 0);
      return { ...o, path, zera: o.caixa < 0 ? fut[0] : zi >= 0 ? fut[zi] : null, fim: path.at(-1) };
    })
    .filter((o) => Math.abs(o.caixa) > 1 || o.liq.some((v) => Math.abs(v) > 1));
  D.invest = soma(D.contas.filter((c) => CFG.investimento.test(c.tipo)).map((c) => c.saldo));
  D.totalContas = soma(D.contas.map((c) => c.saldo));

  // Dívida PJ (Projeção CEF).
  const params = Object.fromEntries((d.param || []).map((p) => [p.id, p]));
  const porObra = {};
  (d.cef || []).filter((r) => noFiltro(r.id)).forEach((r) => (porObra[r.id] = porObra[r.id] || []).push(r));
  D.cef = Object.entries(porObra).map(([id, rows]) => {
    const now = rows.filter((r) => r.mes < m0).at(-1) || rows[0];
    return { id: +id, nome: titulo(cmap[id]?.nome || `Obra ${id}`), rows, now, end: rows.at(-1), p: params[id] || {} };
  });
  D.cart = d.carteira || {};
  D.empresasDoFiltro = empresasDoFiltro;
  return D;
}

// ─── Simulador ───────────────────────────────────────────────────────────────────────────────────
export const PRESETS = {
  base: { overhead: false, obra: 0, vendas: 0, delay: 0, label: 'Cenário igual ao Orçamento' },
  cons: { overhead: true, obra: 10, vendas: 0, delay: 3, label: 'Cenário conservador' },
  stress: { overhead: true, obra: 25, vendas: 15, delay: 3, label: 'Cenário de estresse' },
};

export function cenario(D, s) {
  let saldo = D.caixaHoje;
  const n = D.fut.length;
  const adj = Array(n).fill(0);
  const atraso = D.centros.find((c) => c.id === s.delayId);
  for (let i = 0; i < n; i++) {
    if (s.overhead) adj[i] -= Math.max(0, D.overheadRun + D.overheadP[i]);
    adj[i] += (D.obraP[i] * s.obra) / 100;
    adj[i] -= (D.vendasP[i] * s.vendas) / 100;
    if (atraso && s.delay > 0 && atraso.entP[i]) {
      adj[i] -= atraso.entP[i];
      if (i + s.delay < n) adj[i + s.delay] += atraso.entP[i];
    }
  }
  return D.resFut.map((r, i) => (saldo += r + adj[i]));
}

// Obra com a maior entrada projetada num único mês (padrão do "Atrasar entradas de").
export function obraMaiorEntrada(D) {
  let melhor = null;
  D.centros.forEach((c) => c.entP.forEach((v) => (!melhor || v > melhor.v) && (melhor = { c, v })));
  return melhor?.c || null;
}

export function presetDe(sc) {
  return Object.keys(PRESETS).find((k) => ['overhead', 'obra', 'vendas', 'delay'].every((f) => PRESETS[k][f] === sc[f])) || null;
}
