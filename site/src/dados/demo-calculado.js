// O Grupo Aurora passando pelo motor real do Horizon: payload fictício -> modelo() -> D -> análises.
// Também ajusta rótulos que no produto são de construtora (o site fala com empresas em geral) — só o
// texto muda; os valores são os que o motor calculou.
import { cenario, modelo, PRESETS } from '../motor/modelo.js';
import { folego, indicadores } from '../motor/analise.js';
import { EMPRESAS, hojeBrasilia, payloadDemo } from './empresa-demo.js';

export { EMPRESAS };

const cache = new Map();

// opções: { hoje, empresa (id ou null = grupo), historico, horizonte }.
export function obterD({ hoje = hojeBrasilia(), empresa = null, historico = 6, horizonte = 9 } = {}) {
  const chave = `${hoje}|${empresa}|${historico}|${horizonte}`;
  if (!cache.has(chave)) {
    const d = payloadDemo({ hoje, empresas: empresa ? [empresa] : null, historico, horizonte });
    cache.set(chave, modelo(d, null));
  }
  return cache.get(chave);
}

// Rótulos do produto que são de construtora -> rótulos do site.
const TROCAS = [
  [/^Dívida PJ Caixa$/, 'Endividamento bancário'],
  [/(\d+) obras?\b/, (_, n) => `${n} contrato${+n > 1 ? 's' : ''}`],
  [/nenhuma obra com Projeção CEF no escopo/, 'nenhum contrato no escopo'],
];
const trocar = (s) => TROCAS.reduce((t, [re, por]) => t.replace(re, por), s);

export function cartoesSite(D) {
  return indicadores(D).map((c) => ({
    ...c,
    titulo: trocar(c.titulo),
    detalhe: c.detalhe.map((p) => (typeof p === 'string' ? trocar(p) : p)),
  }));
}

export function folegoSite(D) {
  return folego(D, { ordem: 'risco', mostrar: 'todas' });
}

// Mês em que a série cai abaixo do colchão (índice em D.fut) e o primeiro mês abaixo de zero.
export function rupturas(D, serie) {
  return { colchao: serie.findIndex((v) => v < D.colchao), zero: serie.findIndex((v) => v < 0) };
}

// Menor queda de vendas (%) que faz o caixa furar o colchão, mantendo o resto do Orçamento — o "ponto de
// ruptura" que a IA do site cita. null se nem 60% de queda fura.
export function pontoDeRuptura(D) {
  for (let q = 1; q <= 60; q++) {
    const s = cenario(D, { ...PRESETS.base, vendas: q, delayId: null });
    if (s.some((v) => v < D.colchao)) return q;
  }
  return null;
}
