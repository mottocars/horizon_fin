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

// Opções fixas da "Origem Projeção" (pedido do usuário) — mesma lista do backend
// (dfcPlanoContas.controller.js) e do CHECK da tabela dfc_plano_contas. Rótulos em maiúsculo (pedido
// do usuário); os códigos (value) são os gravados no banco. Usada na aba Plano Contas e no filtro
// "Origem DFC" da aba Orçamentos.
export const ORIGENS_PROJECAO = [
  { value: 'CEF_NOVO_REGISTRO', label: 'CEF - NOVO REGISTRO' },
  { value: 'CEF_MEDICAO', label: 'CEF - MEDIÇÃO' },
  { value: 'CEF_CREDITO_PJ', label: 'CEF - CRÉDITO PJ' },
  { value: 'CEF_JUROS', label: 'CEF - JUROS' },
  { value: 'CEF_AMORTIZACAO', label: 'CEF - AMORTIZAÇÃO' },
  { value: 'SIENGE_ORCAMENTO_EMPRESARIAL', label: 'SIENGE - EMPRESARIAL DESEMBOLSO' },
  { value: 'SIENGE_AGING', label: 'SIENGE - AGING' },
  { value: 'HORIZON_ORCAMENTO_INFORMADO', label: 'HORIZON - INFORMADO' },
];

// Conta sem Origem Projeção, nos filtros ("NÃO INFORMADO", primeira opção).
export const ORIGEM_NAO_INFORMADA = '__nao_informado__';

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

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// '2026-10' -> 'out/26'.
export function rotuloMesCurto(anoMes) {
  const [ano, mes] = anoMes.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

// 'AAAA-MM' de cada mês entre as duas datas ('AAAA-MM-DD'), inclusive (no máximo 240).
export function mesesEntre(inicio, fim) {
  const meses = [];
  let [ano, mes] = inicio.slice(0, 7).split('-').map(Number);
  const [anoFim, mesFim] = fim.slice(0, 7).split('-').map(Number);
  while ((ano < anoFim || (ano === anoFim && mes <= mesFim)) && meses.length < 240) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}
