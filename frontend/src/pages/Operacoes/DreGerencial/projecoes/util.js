// Auxiliares da aba Projeções da DRE (fora dos componentes por causa do fast refresh do Vite). Mesmas
// regras de digitação e formato do Orçamento da DFC (DfcConstrutoras/orcamentoValores.js — duplicadas
// de propósito: telas não importam umas das outras).

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const ORIGEM = {
  NAO_POSSUI: 'NAO_POSSUI',
  INFORMADO: 'HORIZON_ORCAMENTO_INFORMADO',
  EMPRESARIAL: 'SIENGE_ORCAMENTO_EMPRESARIAL',
  AGING: 'SIENGE_AGING',
};

export const ROTULO_ORIGEM = {
  [ORIGEM.INFORMADO]: 'INFORMADO',
  [ORIGEM.EMPRESARIAL]: 'EMPRESARIAL',
  [ORIGEM.AGING]: 'AGING',
};

// 'AAAA-MM' + k meses.
export function somarMeses(anoMes, k) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export function mesesEntre(de, ate) {
  const lista = [];
  for (let m = de; m <= ate && lista.length < 360; m = somarMeses(m, 1)) lista.push(m);
  return lista;
}

export function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// '2026-10' -> 'out/26'.
export function rotuloMes(anoMes) {
  if (!anoMes) return '';
  const [ano, mes] = anoMes.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

// '2026-10' -> 'out/2026'.
export function rotuloMesLongo(anoMes) {
  if (!anoMes) return '';
  const [ano, mes] = anoMes.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano}`;
}

export const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Percentual de uma fração (0,64 -> "64,00%"); `casas` padrão 2.
export function pct(fracao, casas = 2) {
  if (fracao === null || fracao === undefined) return '—';
  const x = Math.abs(fracao) < 0.5 * 10 ** -(casas + 2) ? 0 : fracao * 100;
  return `${x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

// Valor digitado em formato brasileiro -> número com 2 casas; '' -> null; inválido -> NaN.
export function interpretarValor(texto) {
  let t = String(texto ?? '').replace(/\s|R\$/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100) / 100;
}

// Mês e valor de venda de uma unidade — mesma regra do backend (dre-projecoes/calculo.js::
// vendaDaUnidade): o informado; sem nada informado, a venda registrada depois da trava; valor vazio = o
// da venda registrada, senão o ticket médio do tipo.
export function vendaDaUnidade(u, dados) {
  const e = dados?.unidades?.[u.chave];
  const mes = e ? e.mes || null : u.venda_registrada?.mes || null;
  const informado = e && e.valor !== null && e.valor !== undefined ? Number(e.valor) : null;
  return { mes, valor: informado ?? u.venda_registrada?.valor ?? u.ticket ?? 0, informado };
}

// Baixa um arquivo (blob) com o nome dado.
export function baixarArquivo(blob, nome) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// Mensagem de erro de uma resposta em blob (download) ou JSON.
export async function mensagemDeErro(e, padrao) {
  const d = e?.response?.data;
  try {
    return (d instanceof Blob ? JSON.parse(await d.text()) : d)?.message || padrao;
  } catch {
    return padrao;
  }
}

// Cor do valor (negativo em vermelho, como na DRE).
export const corValor = (v) => (v < 0 ? 'text-red-600' : 'text-gray-900');
