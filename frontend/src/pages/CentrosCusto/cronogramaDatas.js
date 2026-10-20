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

// Meses (ou anos) inteiros entre duas datas, arredondando pelos dias — assim a conta volta
// exatamente ao número digitado: mesesEntre(d, somarMeses(d, n)) === n (inclusive no 31/01 → 28/02).
// Negativo quando `ate` vem antes de `de`.
export function mesesEntre(de, ate) {
  return Math.round((paraUtc(ate) - paraUtc(de)) / MS_DIA / DIAS_MES);
}

export function anosEntre(de, ate) {
  return Math.round((paraUtc(ate) - paraUtc(de)) / MS_DIA / 365.25);
}

// O campo de data do navegador passa por anos como 0002 enquanto se digita — só aceita ano
// razoável e data que existe.
export function dataValida(data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const ano = Number(data.slice(0, 4));
  return ano >= 1900 && ano <= 2200 && deUtc(paraUtc(data)) === data;
}

// As etapas do cronograma (= Histórico de Etapas do centro de custo) vão em sequência. Duração de
// uma etapa: meses até o início da seguinte — sem ele, até o fim gravado (histórico antigo); na
// última, anos até o fim dela (o término). null quando não dá pra calcular.
export function duracaoEtapa({ ultima, inicio, inicioSeguinte, fim }) {
  if (!inicio) return null;
  if (ultima) return fim ? anosEntre(inicio, fim) : null;
  if (inicioSeguinte) return mesesEntre(inicio, inicioSeguinte);
  return fim ? mesesEntre(inicio, somarDias(fim, 1)) : null;
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
