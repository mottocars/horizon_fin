// Ciclo de vida das telas animadas: cada cena registrada recebe entrar() quando aparece e sair() quando
// some — os loops só rodam com a tela à vista (e nunca com movimento reduzido, decisão de cada cena).
const cenas = new Map();
let io = null;

function observador() {
  if (io) return io;
  io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        const c = cenas.get(e.target);
        if (!c) continue;
        if (e.isIntersecting && !c.visivel) {
          c.visivel = true;
          c.entrar?.();
        } else if (!e.isIntersecting && c.visivel) {
          c.visivel = false;
          c.sair?.();
        }
      }
    },
    { threshold: 0.15 }
  );
  return io;
}

export function registrarCena(el, { entrar, sair } = {}) {
  if (!el) return;
  cenas.set(el, { entrar, sair, visivel: false });
  observador().observe(el);
}

// Monta quando o elemento chega perto da tela (uma tela de antecedência), cada cena na sua própria tarefa —
// a abertura da página não paga pelas telas lá de baixo.
export function quandoPerto(el, fn, margem = '100% 0px') {
  if (!el) return;
  const io = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setTimeout(fn, 0);
    },
    { rootMargin: margem }
  );
  io.observe(el);
}

// Monta uma cena isolando erros: se uma tela falhar, o resto da página segue.
export async function montar(nome, fn) {
  try {
    return await fn();
  } catch (erro) {
    console.warn(`[site] cena "${nome}" não montou:`, erro);
    return null;
  }
}
