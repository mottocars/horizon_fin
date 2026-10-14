// Auxiliares da aba Orçamentos (fora do componente por causa do fast refresh do Vite).

const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

// Origem Projeção cujos valores são digitados na própria aba Orçamentos.
export const ORIGEM_INFORMADO = 'HORIZON_ORCAMENTO_INFORMADO';

// 'AAAA-MM' -> 'AAAA-MM' do mês seguinte.
export function proximoMes(anoMes) {
  let [ano, mes] = anoMes.split('-').map(Number);
  mes += 1;
  if (mes > 12) {
    mes = 1;
    ano += 1;
  }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

// '2026-10' -> 'outubro/2026'.
export function rotuloMesLongo(anoMes) {
  const [ano, mes] = anoMes.split('-');
  return `${MESES_LONGOS[Number(mes) - 1]}/${ano}`;
}

// Valor digitado em formato brasileiro -> número com 2 casas; '' -> null; inválido -> NaN.
// "1.234,56", "1234,56", "-500", "1.500" (milhar) e "1234.56" (ponto decimal) são aceitos.
export function interpretarValor(texto) {
  let t = String(texto ?? '').replace(/\s|R\$/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100) / 100;
}
