// Preferência de movimento reduzido do sistema — separada do GSAP para o carregamento inicial não depender dele.
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduzir = () => mq.matches;
export const aoMudarMovimento = (cb) => mq.addEventListener('change', cb);
