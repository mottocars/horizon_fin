// Formatos da tela Reforma Tributária.
export { moeda } from '../CronogramasObras/formatos';

const PCT = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PCT2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 0.2345 -> '23,5%'
export function pct(fracao) {
  if (fracao === null || fracao === undefined || !Number.isFinite(fracao)) return '—';
  return `${PCT.format(fracao * 100)}%`;
}

// 11.2 -> '11,20%'
export function aliquota(valor) {
  if (valor === null || valor === undefined) return '—';
  return `${PCT2.format(Number(valor))}%`;
}

// Valor com sinal, sem centavos: 'R$ 1.234' / '−R$ 1.234'; zero vira '—'.
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export function valor(v) {
  if (v === null || v === undefined || Math.abs(v) < 0.5) return '—';
  return MOEDA.format(v);
}

export const REGIMES = {
  RET: { rotulo: 'RET de transição', curto: 'RET', classe: 'bg-blue-50 text-blue-700' },
  REGULAR: { rotulo: 'Regime regular', curto: 'Regular', classe: 'bg-emerald-50 text-emerald-700' },
};

// Número digitado -> Number ou null. Vírgula é o decimal ('11,2'; '3.000.000,50'); sem vírgula, ponto
// só é milhar no formato 1.234.567 (senão é decimal: '11.2').
export function lerNumero(texto) {
  if (texto === null || texto === undefined) return null;
  let t = String(texto).trim().replace(/\s|R\$/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Number -> texto com vírgula pro campo.
export function paraCampo(n, casas = 2) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}
