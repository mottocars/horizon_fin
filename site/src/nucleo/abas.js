// Barra de abas da planilha: cada aba é riscada e excluída quando a seção dela passa, e volta se você
// rolar para cima — o estado da barra é sempre função da posição de rolagem (recalculada a cada quadro de
// rolagem, então nunca fica desatualizada quando as telas são montadas). A aba ativa é a primeira que sobrou.
//   data-apaga="#alvo"       seção que, ao passar, exclui a aba
//   data-ponto="0.45"        (opcional) a aba sai quando 45% do alvo já subiu acima do topo; sem ele, quando
//                            o fim do alvo passa de 60% da altura da tela
import { reduzir } from './preferencias.js';

let api = { apagar() {}, restaurar() {} };
export const abas = () => api;

export function iniciarAbas() {
  const nav = document.querySelector('[data-abas]');
  if (!nav) return api;
  const lista = nav.querySelector('[data-abas-lista]');
  const status = nav.querySelector('[data-abas-status]');
  const links = [...lista.querySelectorAll('a')];
  const timers = new Map();
  const topoH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topo-h')) || 64;

  function atualizar(rolar = true) {
    const vivas = links.filter((a) => !a.classList.contains('riscada'));
    const atual = vivas[0];
    links.forEach((a) => (a === atual ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    if (atual && rolar) {
      const alvo = Math.max(0, atual.offsetLeft - 24);
      if (Math.abs(lista.scrollLeft - alvo) > 4) lista.scrollTo({ left: alvo, behavior: reduzir() ? 'auto' : 'smooth' });
    }
    const n = vivas.length;
    status.textContent = n === 0 ? 'Nenhuma planilha. Que alívio.' : `${n} ${n === 1 ? 'planilha' : 'planilhas'}`;
    nav.classList.toggle('vazia', n === 0);
  }

  function apagar(a) {
    if (!a || a.classList.contains('riscada')) return;
    a.classList.add('riscada');
    if (!a.querySelector('.visualmente-oculto')) a.insertAdjacentHTML('beforeend', '<span class="visualmente-oculto"> (excluída)</span>');
    clearTimeout(timers.get(a));
    timers.set(
      a,
      setTimeout(() => a.classList.add('apagada'), reduzir() ? 0 : 420)
    );
    atualizar();
  }

  function restaurar(a) {
    if (!a || !a.classList.contains('riscada')) return;
    clearTimeout(timers.get(a));
    a.classList.remove('riscada', 'apagada');
    a.querySelector('.visualmente-oculto')?.remove();
    atualizar();
  }

  const regras = links
    .map((a) => ({ a, alvo: a.dataset.apaga !== 'dialogo' && document.querySelector(a.dataset.apaga), ponto: a.dataset.ponto ? +a.dataset.ponto : null }))
    .filter((r) => r.alvo);

  function conferir() {
    const vh = window.innerHeight;
    const topo = topoH();
    for (const { a, alvo, ponto } of regras) {
      const r = alvo.getBoundingClientRect();
      const passou = ponto === null ? r.bottom <= vh * 0.6 : r.top + r.height * ponto <= topo;
      if (passou) apagar(a);
      else restaurar(a);
    }
  }
  let quadro = 0;
  const agendar = () => {
    if (!quadro) quadro = requestAnimationFrame(() => ((quadro = 0), conferir()));
  };
  window.addEventListener('scroll', agendar, { passive: true });
  window.addEventListener('resize', agendar);
  atualizar(false);
  // Primeira conferência fora do carregamento (ela lê a posição das seções = layout da página inteira).
  // Abrindo a página no topo, nenhuma aba saiu; o primeiro evento de rolagem confere de verdade.
  if (window.scrollY > 0 || location.hash) setTimeout(agendar, 300);

  const porChave = (k) => links.find((a) => a.dataset.apaga === k);
  api = { apagar: (k) => apagar(porChave(k)), restaurar: (k) => restaurar(porChave(k)) };
  return api;
}
