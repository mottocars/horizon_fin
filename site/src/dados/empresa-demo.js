// Empresa fictícia do site — Grupo Aurora (4 empresas, 8 centros de custo) — no MESMO formato da resposta
// da rota /dashboards/economico-financeiro/fluxo-caixa do Horizon (backend fluxoCaixaPainel.service.js),
// para passar pelo motor real (src/motor/modelo.js). Determinístico: mesma data, mesmos números.
// Sem DOM — também roda no Node (scripts/testar-motor.mjs).
//
// As máscaras seguem o padrão do Sienge (maiúsculas, sem acento) porque o motor as reconhece por
// expressão regular (modelo.js › CFG): FLUXO OPERACIONAL, CUSTOS DIRETOS E MAO DE OBRA, PESSOAL,
// DESPESAS ADMINISTRATIVAS, RECEITA DE VENDAS, DISTRIBUICAO A SOCIOS.
import { addM } from '../motor/modelo.js';

export const EMPRESAS = [
  { id: 1, nome: 'AURORA ALIMENTOS' },
  { id: 2, nome: 'AURORA LOGÍSTICA' },
  { id: 3, nome: 'AURORA VAREJO' },
  { id: 4, nome: 'AURORA INCORPORADORA' },
];

// rec: receita mensal orçada; mix: fração da receita (cd = custos diretos, pes = pessoal, adm = despesas
// administrativas, imp = impostos, fre = logística e fretes); cdFixo: custo direto mensal que não acompanha a
// receita (obra); saz: perfil de sazonalidade.
export const CENTROS = [
  { id: 11, co: 1, nome: 'FÁBRICA CONTAGEM', rec: 9.4e6, mix: { cd: 0.53, pes: 0.13, adm: 0.045, imp: 0.09, fre: 0.06 }, saz: 'industria' },
  { id: 12, co: 1, nome: 'FOOD SERVICE', rec: 3.1e6, mix: { cd: 0.55, pes: 0.12, adm: 0.05, imp: 0.09, fre: 0.08 }, saz: 'industria' },
  { id: 21, co: 2, nome: 'FROTA PRÓPRIA', rec: 4.3e6, mix: { cd: 0.47, pes: 0.22, adm: 0.06, imp: 0.08, fre: 0.04 }, saz: 'logistica' },
  { id: 22, co: 2, nome: 'CD BETIM', rec: 2.4e6, mix: { cd: 0.4, pes: 0.25, adm: 0.08, imp: 0.08, fre: 0.06 }, saz: 'logistica' },
  { id: 31, co: 3, nome: 'LOJAS CAPITAL', rec: 3.9e6, mix: { cd: 0.6, pes: 0.18, adm: 0.09, imp: 0.1, fre: 0.03 }, saz: 'varejo' },
  { id: 32, co: 3, nome: 'E-COMMERCE', rec: 1.7e6, mix: { cd: 0.56, pes: 0.1, adm: 0.18, imp: 0.1, fre: 0.14 }, saz: 'varejo' },
  { id: 41, co: 4, nome: 'RESIDENCIAL SERRA AZUL', rec: 2.2e6, mix: { cd: 0, pes: 0.04, adm: 0.06, imp: 0.06, fre: 0 }, cdFixo: 1.25e6, saz: 'repasse' },
  { id: 42, co: 4, nome: 'RESIDENCIAL AURORA', rec: 0.9e6, mix: { cd: 0, pes: 0.03, adm: 0.05, imp: 0.06, fre: 0 }, cdFixo: 1.1e6, saz: 'repasse2' },
];

// Multiplicador da receita por mês do calendário (1–12).
const SAZ = {
  industria: { 11: 1.05, 12: 1.08, 1: 0.84, 2: 0.88, 3: 0.97 },
  logistica: { 11: 1.06, 12: 1.1, 1: 0.86, 2: 0.9 },
  varejo: { 11: 1.22, 12: 1.38, 1: 0.66, 2: 0.7, 3: 0.88 },
  // Incorporação: entradas em blocos (repasses), não todo mês igual.
  repasse: { 1: 0.5, 2: 0.6, 3: 2.6, 4: 0.7, 5: 0.9, 6: 2.1, 7: 0.8, 8: 1, 9: 1.5, 10: 0.6, 11: 0.8, 12: 2.4 },
  repasse2: { 1: 0.3, 2: 0.4, 3: 0.5, 4: 1.6, 5: 0.6, 6: 0.7, 7: 1.8, 8: 0.6, 9: 0.7, 10: 0.5, 11: 1.4, 12: 0.6 },
};
const PESSOAL = { 12: 1.9, 5: 1.06 }; // 13º no "dezembro"; dissídio no "maio" (ver mesCal)

// Linhas fora do operacional, por empresa (valor mensal; `meses` = só nesses meses do calendário).
const NAO_OPERACIONAL = [
  { co: 1, n1: 'FLUXO DE INVESTIMENTO', lado: 'S', n2: 'INVESTIMENTOS EM ATIVOS', v: -0.42e6 },
  { co: 2, n1: 'FLUXO DE INVESTIMENTO', lado: 'S', n2: 'INVESTIMENTOS EM ATIVOS', v: -0.28e6 },
  { co: 3, n1: 'FLUXO DE INVESTIMENTO', lado: 'S', n2: 'INVESTIMENTOS EM ATIVOS', v: -0.06e6 },
  { co: 1, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'AMORTIZACAO DE EMPRESTIMOS', v: -0.5e6, extra: { 3: -3.6e6 } },
  { co: 2, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'AMORTIZACAO DE EMPRESTIMOS', v: -0.32e6 },
  { co: 4, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'AMORTIZACAO DE EMPRESTIMOS', v: -0.1e6 },
  { co: 1, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'JUROS E ENCARGOS', v: -0.21e6 },
  { co: 2, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'JUROS E ENCARGOS', v: -0.11e6 },
  { co: 3, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'JUROS E ENCARGOS', v: -0.04e6 },
  { co: 4, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'JUROS E ENCARGOS', v: -0.05e6 },
  { co: 1, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'DISTRIBUICAO A SOCIOS', v: -1.7e6, meses: [1, 7] },
  { co: 2, n1: 'FLUXO DE FINANCIAMENTO', lado: 'S', n2: 'DISTRIBUICAO A SOCIOS', v: -0.6e6, meses: [1, 7] },
];

// Saldo das contas hoje, por empresa.
const CONTAS = [
  { co: 1, nome: 'Itaú 3421-7', tipo: 'CONTA CORRENTE', saldo: 4.12e6 },
  { co: 1, nome: 'Itaú CDB', tipo: 'INVESTIMENTO', saldo: 11.06e6 },
  { co: 1, nome: 'Bradesco 0188-2', tipo: 'CONTA CORRENTE', saldo: 1.3e6 },
  { co: 1, nome: 'Bradesco Compromissada', tipo: 'INVESTIMENTO', saldo: 3.02e6 },
  { co: 2, nome: 'Santander 7710-4', tipo: 'CONTA CORRENTE', saldo: 2.21e6 },
  { co: 2, nome: 'Santander CDB', tipo: 'INVESTIMENTO', saldo: 7.43e6 },
  { co: 3, nome: 'Itaú 5502-1', tipo: 'CONTA CORRENTE', saldo: 0.96e6 },
  { co: 3, nome: 'Itaú CDB', tipo: 'INVESTIMENTO', saldo: 0.62e6 },
  { co: 4, nome: 'Caixa 0921-3', tipo: 'CONTA CORRENTE', saldo: 2.95e6 },
  { co: 4, nome: 'Caixa Aplicação', tipo: 'INVESTIMENTO', saldo: 7.18e6 },
];

// Endividamento por contrato (centro): saldo devedor no início do histórico e variação mensal.
const DIVIDAS = [
  { id: 11, inicio: 17.6e6, mes: -0.5e6, extra: { 3: -3.6e6 } },
  { id: 21, inicio: 8.3e6, mes: -0.32e6 },
  { id: 41, inicio: 4.4e6, mes: -0.1e6 },
];

const CARTEIRA = { receber: { vencido: 1.38e6, a_vencer: 46.2e6, d90: 33.9e6, n_vencido: 214 }, pagar: { vencido: 0.41e6, a_vencer: 22.8e6 } };

// PRNG com semente (mulberry32) — números estáveis entre recargas e capturas de tela.
function gerador(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 'AAAA-MM-DD' de hoje em Brasília.
export function hojeBrasilia(agora = new Date()) {
  return agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

// Mês "do calendário" usado pela sazonalidade, ancorado no mês atual: o Grupo Aurora vive sempre como se
// hoje fosse outubro (13º dois meses à frente, distribuição aos sócios em três, amortização grande em cinco).
// Assim o site conta a mesma história em qualquer data — os rótulos dos meses continuam os reais.
const MES_ANCORA = 10;
const mesesEntre = (de, ate) => (+ate.slice(0, 4) - +de.slice(0, 4)) * 12 + (+ate.slice(5, 7) - +de.slice(5, 7));
const mesCal = (m, m0) => ((((MES_ANCORA - 1 + mesesEntre(m0, m)) % 12) + 12) % 12) + 1;
const arred = (v) => Math.round(v / 100) * 100;

// Orçado de um centro num mês: { 'n2': valor } (entradas positivas, saídas negativas).
function orcadoCentro(c, m, m0) {
  const k = mesCal(m, m0);
  const rec = c.rec * (SAZ[c.saz][k] ?? 1);
  const pes = c.rec * c.mix.pes * (PESSOAL[k] ?? 1);
  return {
    'RECEITA DE VENDAS': rec,
    'CUSTOS DIRETOS E MAO DE OBRA': -(c.cdFixo ?? rec * c.mix.cd),
    PESSOAL: -pes,
    'DESPESAS ADMINISTRATIVAS': -c.rec * c.mix.adm,
    'IMPOSTOS SOBRE VENDAS': -rec * c.mix.imp,
    'LOGISTICA E FRETES': -rec * c.mix.fre,
  };
}
// Viés do realizado contra o orçado — o Orçamento do Grupo Aurora erra sempre para o mesmo lado:
// receita um pouco abaixo, custos diretos, pessoal e fretes acima.
const VIES = { 'RECEITA DE VENDAS': [0.975, 0.02], 'CUSTOS DIRETOS E MAO DE OBRA': [1.045, 0.02], PESSOAL: [1.05, 0.01], 'DESPESAS ADMINISTRATIVAS': [1, 0.04], 'IMPOSTOS SOBRE VENDAS': [0.975, 0.02], 'LOGISTICA E FRETES': [1.08, 0.03] };

const N2_ENT = ['RECEITA DE VENDAS'];
const N2_SAI = ['CUSTOS DIRETOS E MAO DE OBRA', 'PESSOAL', 'DESPESAS ADMINISTRATIVAS', 'IMPOSTOS SOBRE VENDAS', 'LOGISTICA E FRETES'];

// opções: hoje ('AAAA-MM-DD'), empresas (ids; null = todas), historico (meses fechados), horizonte (meses).
export function payloadDemo({ hoje = hojeBrasilia(), empresas = null, historico = 6, horizonte = 9 } = {}) {
  const rnd = gerador(20261019);
  const m0 = hoje.slice(0, 7);
  const ini = addM(m0, -historico);
  const fim = addM(m0, horizonte - 1);
  const meses = [];
  for (let m = ini; m <= fim; m = addM(m, 1)) meses.push(m);
  // Fração do mês atual já realizada (até hoje, inclusive).
  const [a, mm, dd] = hoje.split('-').map(Number);
  const diasMes = new Date(Date.UTC(a, mm, 0)).getUTCDate();
  const feito = Math.min(1, dd / diasMes);

  const noEscopo = (co) => !empresas || empresas.includes(co);
  const centros = CENTROS.filter((c) => noEscopo(c.co));

  // Valores por coluna: pc['AAAA-MM|R' | 'AAAA-MM|P'].
  const porN2 = {}; // `${n1}|${lado}|${n2}` -> pc
  const pc = (k) => (porN2[k] = porN2[k] || {});
  const somar = (obj, k, v) => (obj[k] = (obj[k] || 0) + v);
  const real = [];
  const proj = [];
  const restante = [];

  for (const c of centros) {
    for (const m of meses) {
      const orc = orcadoCentro(c, m, m0);
      const ehHist = m < m0;
      const ehAtual = m === m0;
      let ent = 0;
      let sai = 0;
      let entP = 0;
      let saiP = 0;
      for (const n2 of [...N2_ENT, ...N2_SAI]) {
        const lado = N2_ENT.includes(n2) ? 'E' : 'S';
        const chave = `FLUXO OPERACIONAL|${lado}|${n2}`;
        const p = arred(orc[n2]);
        if (!p) continue;
        somar(pc(chave), `${m}|P`, p);
        if (lado === 'E') entP += p;
        else saiP += p;
        if (ehHist || ehAtual) {
          const [vies, ruido] = VIES[n2];
          const fator = vies + (rnd() * 2 - 1) * ruido;
          const r = arred(p * fator * (ehAtual ? feito : 1));
          somar(pc(chave), `${m}|R`, r);
          if (lado === 'E') ent += r;
          else sai += r;
          if (ehAtual) {
            const falta = lado === 'E' ? Math.max(0, p - r) : Math.min(0, p - r);
            if (falta) restante.push({ centro_id: c.id, n1: 'FLUXO OPERACIONAL', n2, valor: falta });
          }
        }
      }
      if (ehHist || ehAtual) real.push({ id: c.id, mes: m, ent, sai, captacao: 0 });
      if (!ehHist) proj.push({ id: c.id, mes: m, ent: entP, sai: saiP, captacao: 0 });
    }
  }

  // Fora do operacional (investimento, empréstimos, sócios) — no centro principal de cada empresa.
  for (const l of NAO_OPERACIONAL.filter((x) => noEscopo(x.co))) {
    const centroPrincipal = CENTROS.find((c) => c.co === l.co).id;
    for (const m of meses) {
      const k = mesCal(m, m0);
      if (l.meses && !l.meses.includes(k)) continue;
      const p = arred(l.v + (l.extra?.[k] ?? 0));
      const chave = `${l.n1}|${l.lado}|${l.n2}`;
      somar(pc(chave), `${m}|P`, p);
      if (m < m0) somar(pc(chave), `${m}|R`, p);
      if (m === m0) {
        const r = arred(p * feito);
        somar(pc(chave), `${m}|R`, r);
        if (p - r) restante.push({ centro_id: centroPrincipal, n1: l.n1, n2: l.n2, valor: p - r });
      }
    }
  }

  // Estrutura máscara 1 › lado › máscara 2, e as linhas de total.
  const ordemN1 = ['FLUXO OPERACIONAL', 'FLUXO DE INVESTIMENTO', 'FLUXO DE FINANCIAMENTO'];
  const resultado = {};
  const estrutura = ordemN1
    .map((n1) => {
      const lados = ['E', 'S']
        .map((lado) => {
          const filhos = Object.entries(porN2)
            .filter(([k]) => k.startsWith(`${n1}|${lado}|`))
            .map(([k, v]) => ({ descricao: k.split('|')[2], porColuna: v }));
          if (!filhos.length) return null;
          const porColuna = {};
          filhos.forEach((f) => Object.entries(f.porColuna).forEach(([col, v]) => somar(porColuna, col, v)));
          Object.entries(porColuna).forEach(([col, v]) => somar(resultado, col, v));
          return { chave: lado, descricao: lado === 'E' ? 'ENTRADAS' : 'SAIDAS', porColuna, filhos };
        })
        .filter(Boolean);
      return lados.length ? { descricao: n1, lados } : null;
    })
    .filter(Boolean);

  // Contas e saldos: caixa de hoje = soma das contas; abertura do mês = hoje − realizado do mês; os
  // fechamentos dos meses anteriores saem de trás para a frente pelo resultado realizado.
  const contas = CONTAS.filter((c) => noEscopo(c.co)).map((c, i) => ({
    id: i + 1,
    company_id: c.co,
    empresa: EMPRESAS.find((e) => e.id === c.co).nome,
    nome: c.nome,
    tipo: c.tipo,
    saldo: c.saldo,
  }));
  const caixaHoje = contas.reduce((s, c) => s + c.saldo, 0);
  const saldoInicial = {};
  const saldoFinal = {};
  let abertura = caixaHoje - (resultado[`${m0}|R`] || 0);
  saldoInicial[`${m0}|R`] = abertura;
  for (let m = addM(m0, -1); m >= ini; m = addM(m, -1)) {
    saldoFinal[`${m}|R`] = abertura;
    abertura -= resultado[`${m}|R`] || 0;
    saldoInicial[`${m}|R`] = abertura;
  }

  const cef = [];
  for (const dv of DIVIDAS.filter((x) => centros.some((c) => c.id === x.id))) {
    let s = dv.inicio;
    for (const m of meses) {
      s += dv.mes + (dv.extra?.[mesCal(m, m0)] ?? 0);
      cef.push({ id: dv.id, mes: m, saldo: s });
    }
  }

  // Carteira proporcional à receita do escopo.
  const peso = centros.reduce((s, c) => s + c.rec, 0) / CENTROS.reduce((s, c) => s + c.rec, 0);
  const escala = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * peso)]));

  return {
    m0,
    hoje,
    meses: { ini, fim },
    fluxo: { estrutura, saldoInicial, saldoFinal, resultado },
    restante,
    contas,
    centros: centros.map((c) => ({
      id: c.id,
      nome: c.nome,
      company_id: c.co,
      company_name: EMPRESAS.find((e) => e.id === c.co).nome,
      contrato: null,
      param_versao: null,
      projeta_dfc: true,
    })),
    real,
    proj,
    cef,
    param: [],
    carteira: { receber: escala(CARTEIRA.receber), pagar: escala(CARTEIRA.pagar) },
  };
}
