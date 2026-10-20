// Formatos das abas de Cronogramas Obras.

export const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// 'AAAA-MM-DD' -> 'out/2029' (pedido do usuário).
export function mesAno(data) {
  if (!data) return null;
  const [ano, mes] = data.split('-');
  return `${MESES_ABREV[Number(mes) - 1]}/${ano}`;
}

const MOEDA_INTEIRA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const MOEDA_CENTAVOS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MOEDA_COMPACTA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 });

// moeda(18303125.72) -> 'R$ 18.303.126'; { compacta: true } -> 'R$ 18,3 mi'; { centavos: true } -> 'R$ 18.303.125,72'.
export function moeda(valor, { compacta = false, centavos = false } = {}) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return (compacta ? MOEDA_COMPACTA : centavos ? MOEDA_CENTAVOS : MOEDA_INTEIRA).format(n);
}
