import { gsap, reduzir } from './movimento.js';

// Conta de 0 até o valor, escrevendo com o formatador do motor (brl, pct...).
export function contar(el, valor, formatar, { duracao = 1.3, atraso = 0 } = {}) {
  if (!el) return null;
  if (reduzir() || !Number.isFinite(valor)) {
    el.textContent = formatar(valor);
    return null;
  }
  const o = { v: 0 };
  el.textContent = formatar(0);
  return gsap.to(o, {
    v: valor,
    duration: duracao,
    delay: atraso,
    ease: 'power3.out',
    onUpdate: () => (el.textContent = formatar(o.v)),
    onComplete: () => (el.textContent = formatar(valor)),
  });
}
