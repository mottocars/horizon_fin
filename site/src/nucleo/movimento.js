// GSAP + ScrollTrigger num lugar só. Este módulo só é carregado junto com a primeira tela que anima
// (cenas carregadas sob demanda), para não pesar na abertura da página.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export { reduzir, aoMudarMovimento } from './preferencias.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

// Recalcula as posições dos gatilhos quando a altura da página muda (fontes, telas montadas, FAQ aberta).
let pendente = 0;
export function recalcular() {
  clearTimeout(pendente);
  pendente = setTimeout(() => ScrollTrigger.refresh(), 150);
}
new ResizeObserver(recalcular).observe(document.body);
document.fonts?.ready.then(recalcular);

if (new URLSearchParams(location.search).has('captura')) window.__site = { ...(window.__site || {}), ScrollTrigger };

export { gsap, ScrollTrigger };
