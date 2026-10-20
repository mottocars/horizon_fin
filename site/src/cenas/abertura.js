// Abertura e navegação: pular a animação da planilha na primeira interação, topo com borda ao rolar,
// menu do celular e rolagem suave dos links internos (respeitando movimento reduzido).
import { reduzir } from '../nucleo/preferencias.js';
import { montarColega } from './colega.js';

export function montarAbertura() {
  const hero = document.querySelector('[data-hero]');
  const pular = () => hero?.classList.add('intro-pular');
  montarColega(hero?.querySelector('[data-folha]'));
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, pular, { once: true, passive: true }));

  const topo = document.querySelector('[data-topo]');
  const marcar = () => topo?.classList.toggle('rolou', window.scrollY > 8);
  window.addEventListener('scroll', marcar, { passive: true });
  marcar();

  const botaoMenu = document.querySelector('.topo__menu');
  const menu = document.getElementById('menu-principal');
  const abrir = (sim) => {
    botaoMenu?.setAttribute('aria-expanded', String(sim));
    menu?.classList.toggle('aberto', sim);
  };
  botaoMenu?.addEventListener('click', () => abrir(botaoMenu.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && abrir(false));

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const alvo = id && document.getElementById(id);
    if (!alvo) return;
    e.preventDefault();
    abrir(false);
    pular();
    alvo.scrollIntoView({ behavior: reduzir() ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    // Leva o foco junto (leitores de tela e teclado continuam dali).
    if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
  });
}
