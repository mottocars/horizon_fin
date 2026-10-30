// Contas de data do cronograma das obras (= Histórico de Etapas do centro de custo). Datas sempre como o texto
// 'AAAA-MM-DD' do banco (sem fuso), contas em UTC pra o horário de verão nunca comer um dia.

const MS_DIA = 86400000;
const DIAS_MES = 365.25 / 12;

function paraUtc(data) {
  const [a, m, d] = data.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Mesmo dia no mês de destino; se ele não existir, o último dia do mês (31/01 + 1 = 28/02).
export function somarMeses(data, meses) {
  const [a, m, d] = data.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return deUtc(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(d, ultimoDia)));
}

export function somarAnos(data, anos) {
  return somarMeses(data, anos * 12);
}

export function somarDias(data, dias) {
  return deUtc(paraUtc(data) + dias * MS_DIA);
}

// Meses inteiros entre duas datas, arredondando pelos dias — assim a conta volta
// exatamente ao número digitado: mesesEntre(d, somarMeses(d, n)) === n (inclusive no 31/01 → 28/02).
// Negativo quando `ate` vem antes de `de`.
export function mesesEntre(de, ate) {
  return Math.round((paraUtc(ate) - paraUtc(de)) / MS_DIA / DIAS_MES);
}

// O campo de data do navegador passa por anos como 0002 enquanto se digita — só aceita ano
// razoável e data que existe.
export function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const ano = Number(data.slice(0, 4));
  return ano >= 1900 && ano <= 2200 && deUtc(paraUtc(data)) === data;
}

// Unidade da duração da etapa: o "Tipo duração" da máscara Etapas do Centro de Custo (pedido do
// usuário — MESES ou ANOS). Sem ele (versão do cronograma gravada antes de existir), como era:
// meses, e anos na última.
export const duracaoEmAnos = (tipoDuracao, ultima) => (tipoDuracao || (ultima ? 'ANOS' : 'MESES')) === 'ANOS';

// Meses que uma duração digitada representa (em anos, pode vir quebrada: 2,5 anos = 30 meses).
export const mesesDaDuracao = (n, anos) => (anos ? Math.round(n * 12) : n);

// As etapas do cronograma (= Histórico de Etapas do centro de custo) vão em sequência. Duração de
// uma etapa: até o início da seguinte — sem ele, até o fim gravado (histórico antigo); na última,
// até o fim dela (o término). Em meses ou, com `anos`, em anos (com uma casa: 30 meses = 2,5).
// null quando não dá pra calcular.
export function duracaoEtapa({ ultima, inicio, inicioSeguinte, fim, anos = ultima }) {
  if (!inicio) return null;
  let meses = null;
  if (ultima) meses = fim ? mesesEntre(inicio, fim) : null;
  else if (inicioSeguinte) meses = mesesEntre(inicio, inicioSeguinte);
  else if (fim) meses = mesesEntre(inicio, somarDias(fim, 1));
  if (meses === null) return null;
  return anos ? Math.round((meses / 12) * 10) / 10 : meses;
}

// Fim da etapa do jeito que o backend grava (cronogramaCentros.service.js): véspera do início da
// seguinte — sem ele, o fim que já estava —; na última, o término. null se cair antes do início.
export function fimEtapa({ ultima, inicio, inicioSeguinte, fim }) {
  if (!inicio) return null;
  const calculado = ultima ? fim : inicioSeguinte ? somarDias(inicioSeguinte, -1) : fim;
  return calculado && calculado >= inicio ? calculado : null;
}

export function formatarData(data) {
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}
