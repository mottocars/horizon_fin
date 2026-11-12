// Obra 360º › Avanço das Obras: as visões Mensal, Semanal e Diária (pedido do usuário). Cada período
// é { ini, fim } em 'AAAA-MM-DD': o mês (do dia 1 ao último dia), a semana (domingo a sábado — "a
// semana terminando no sábado") ou o dia. As curvas vêm por data (só os dias em que o valor muda) e o
// valor de um período é o acumulado no último dia dele.
export const VISOES = [
  { id: 'mensal', rotulo: 'Mensal' },
  { id: 'semanal', rotulo: 'Semanal' },
  { id: 'diaria', rotulo: 'Diária' },
];
export const visaoValida = (v) => (VISOES.some((x) => x.id === v) ? v : 'mensal');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIA = 86400000;
const tempo = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoDe = (t) => new Date(t).toISOString().slice(0, 10);
const somar = (iso, dias) => isoDe(tempo(iso) + dias * DIA);

export const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '–');
const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const mesAno = (iso) => `${MESES[+iso.slice(5, 7) - 1]}/${iso.slice(2, 4)}`;

// O período da visão que contém o dia.
export function periodoDe(visao, iso) {
  if (visao === 'diaria') return { ini: iso, fim: iso };
  if (visao === 'semanal') {
    const sabado = somar(iso, 6 - new Date(tempo(iso)).getUTCDay());
    return { ini: somar(sabado, -6), fim: sabado };
  }
  const [a, m] = [+iso.slice(0, 4), +iso.slice(5, 7)];
  return { ini: `${iso.slice(0, 7)}-01`, fim: isoDe(Date.UTC(a, m, 0)) };
}

// Os períodos da visão que cobrem de `de` a `ate` (inclusive).
export function periodosEntre(visao, de, ate) {
  const lista = [];
  let p = periodoDe(visao, de);
  while (p.ini <= ate) {
    lista.push(p);
    p = periodoDe(visao, somar(p.fim, 1));
  }
  return lista;
}
export const periodoAnterior = (visao, p) => periodoDe(visao, somar(p.ini, -1));

// Rótulo curto (eixo do gráfico) e longo (dica com o mouse).
export function rotuloCurto(visao, p) {
  return visao === 'mensal' ? mesAno(p.ini) : `${diaMes(p.fim)}/${p.fim.slice(2, 4)}`;
}
export function rotuloLongo(visao, p) {
  if (visao === 'mensal') return mesAno(p.ini);
  if (visao === 'semanal') return `Semana de ${diaMes(p.ini)} a ${dataBr(p.fim)}`;
  return dataBr(p.fim);
}

// Valor de uma curva [[data, %]...] no dia: o do último ponto até ele; antes do primeiro, null.
export function valorEm(pontos, iso) {
  if (!pontos || !pontos.length || pontos[0][0] > iso) return null;
  let lo = 0;
  let hi = pontos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pontos[mid][0] <= iso) lo = mid;
    else hi = mid - 1;
  }
  return pontos[lo][1];
}
