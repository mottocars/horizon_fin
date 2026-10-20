// "Enquanto você dorme": no desktop, uma tela fixa ao lado troca conforme o horário que está no meio da
// tela; no celular, cada horário tem a própria tela logo abaixo do texto. Só a tela visível anima.
import { TELAS } from '../mocks/dia.js';
import { registrarCena } from '../nucleo/cenas.js';
import { reduzir } from '../nucleo/preferencias.js';

const ehCelular = (t) => t === 'saldos';
const envolver = (nome, html) => (ehCelular(nome) ? html : `<div class="janela janela--compacta">${html}</div>`);

export function montarDia(raiz, ctx) {
  const passos = [...raiz.querySelectorAll('[data-passo]')];
  const lado = raiz.querySelector('[data-dia-tela]');

  // Desktop: todas as telas empilhadas; só a ativa fica visível (as outras, inert).
  lado.innerHTML = passos.map((p) => `<div data-tela="${p.dataset.passo}" inert>${envolver(p.dataset.passo, TELAS[p.dataset.passo].html(ctx))}</div>`).join('');
  const telas = Object.fromEntries([...lado.children].map((el) => [el.dataset.tela, el]));
  let ativa = null;
  let parar = null;
  let ladoVisivel = false;

  function ativar(nome) {
    if (nome === ativa) return;
    ativa = nome;
    passos.forEach((p) => p.classList.toggle('ativo', p.dataset.passo === nome));
    Object.entries(telas).forEach(([k, el]) => (k === nome ? el.removeAttribute('inert') : el.setAttribute('inert', '')));
    reiniciar();
  }
  function reiniciar() {
    parar?.();
    parar = null;
    if (ativa && ladoVisivel && !reduzir() && getComputedStyle(lado.parentElement).display !== 'none') parar = TELAS[ativa].animar(telas[ativa]);
  }

  const io = new IntersectionObserver(
    (es) => es.forEach((e) => e.isIntersecting && ativar(e.target.dataset.passo)),
    { rootMargin: '-45% 0px -45% 0px' }
  );
  passos.forEach((p) => io.observe(p));
  ativar(passos[0].dataset.passo);
  registrarCena(lado, {
    entrar() {
      ladoVisivel = true;
      reiniciar();
    },
    sair() {
      ladoVisivel = false;
      reiniciar();
    },
  });

  // Celular: a tela de cada horário logo abaixo dele.
  raiz.querySelectorAll('[data-inline]').forEach((alvo) => {
    const nome = alvo.dataset.inline;
    alvo.setAttribute('aria-hidden', 'true');
    alvo.innerHTML = envolver(nome, TELAS[nome].html(ctx));
    let pararInline = null;
    registrarCena(alvo, {
      entrar() {
        if (!reduzir() && getComputedStyle(alvo).display !== 'none') pararInline = TELAS[nome].animar(alvo);
      },
      sair() {
        pararInline?.();
        pararInline = null;
      },
    });
  });
}
