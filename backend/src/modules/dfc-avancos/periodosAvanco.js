// Visões Mensal, Semanal e Diária do Avanço das Obras (Obra 360º) — as mesmas contas da tela
// (frontend: pages/Dashboards/CronogramasObras/periodosAvanco.js), para o Excel. Cada período é
// { ini, fim } em 'AAAA-MM-DD': o mês, a semana (domingo a sábado — "terminando no sábado") ou o dia.
// As curvas vêm por data ([[data, %]...], só os dias em que o valor muda) e o valor de um período é o
// acumulado no último dia dele.
const VISOES = { mensal: 'Mensal', semanal: 'Semanal', diaria: 'Diária' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIA = 86400000;
const tempo = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const isoDe = (t) => new Date(t).toISOString().slice(0, 10);
const somar = (iso, dias) => isoDe(tempo(iso) + dias * DIA);
const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function periodoDe(visao, iso) {
  if (visao === 'diaria') return { ini: iso, fim: iso };
  if (visao === 'semanal') {
    const sabado = somar(iso, 6 - new Date(tempo(iso)).getUTCDay());
    return { ini: somar(sabado, -6), fim: sabado };
  }
  const [a, m] = [+iso.slice(0, 4), +iso.slice(5, 7)];
  return { ini: `${iso.slice(0, 7)}-01`, fim: isoDe(Date.UTC(a, m, 0)) };
}

function periodosEntre(visao, de, ate) {
  const lista = [];
  let p = periodoDe(visao, de);
  while (p.ini <= ate) {
    lista.push(p);
    p = periodoDe(visao, somar(p.fim, 1));
  }
  return lista;
}
const periodoAnterior = (visao, p) => periodoDe(visao, somar(p.ini, -1));

function rotulo(visao, p) {
  if (visao === 'mensal') return `${MESES[+p.ini.slice(5, 7) - 1]}/${p.ini.slice(0, 4)}`;
  if (visao === 'semanal') return `Semana de ${p.ini.slice(8, 10)}/${p.ini.slice(5, 7)} a ${dataBr(p.fim)}`;
  return dataBr(p.fim);
}

// Valor de uma curva no dia: o do último ponto até ele; antes do primeiro, null.
function valorEm(pontos, iso) {
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

module.exports = { VISOES, periodoDe, periodosEntre, periodoAnterior, rotulo, valorEm, somar, dataBr };
