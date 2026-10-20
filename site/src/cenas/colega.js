// "Somente leitura (Juliana está editando)": o cursor da Juliana passeia pelas células da planilha da abertura
// e, de vez em quando, "corrige" uma delas (data-versoes="a|b|c": cada edição passa para a próxima versão).
// Discreto: começa depois da abertura, só anda com a planilha à vista e nunca com movimento reduzido.
import { registrarCena } from '../nucleo/cenas.js';
import { reduzir } from '../nucleo/preferencias.js';

// Sorteio com semente: a Juliana faz sempre o mesmo caminho (capturas de tela estáveis).
function gerador(semente) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function montarColega(folha) {
  if (!folha || reduzir()) return;
  const rnd = gerador(1035);
  const cursor = document.createElement('span');
  cursor.className = 'colega';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = '<span class="colega__nome">Juliana</span>';
  folha.appendChild(cursor);

  let atual = null;
  let timer = 0;
  let passo = 0;
  let ativo = false;
  let primeira = true;

  // Só células à vista (no celular e em telas baixas algumas colunas/linhas ficam escondidas).
  const candidatas = () => [...folha.querySelectorAll('[data-visita], [data-versoes]')].filter((c) => c.getClientRects().length && c !== atual);

  function posicionar(cel, animar = true) {
    const f = folha.getBoundingClientRect();
    const r = cel.getBoundingClientRect();
    cursor.classList.toggle('sem-transicao', !animar);
    cursor.style.transform = `translate(${Math.round(r.left - f.left)}px, ${Math.round(r.top - f.top)}px)`;
    cursor.style.width = `${Math.round(r.width)}px`;
    cursor.style.height = `${Math.round(r.height)}px`;
    // Nas primeiras linhas o nome vai para baixo da célula (em cima ficaria sob a barra de fórmula).
    cursor.classList.toggle('colega--embaixo', r.top - f.top < 110);
  }

  function escrever(cel, valor) {
    if (/^#/.test(valor)) {
      const erro = document.createElement('span');
      erro.className = 'cel__erro cel__erro--viva';
      erro.textContent = valor;
      cel.replaceChildren(erro);
    } else cel.textContent = valor;
  }

  function editar(cel) {
    const versoes = cel.dataset.versoes.split('|');
    const i = ((+cel.dataset.v || 0) + 1) % versoes.length;
    cel.dataset.v = String(i);
    cel.classList.add('editando');
    timer = setTimeout(() => {
      escrever(cel, versoes[i]);
      cel.classList.remove('editando');
      cel.classList.add('editada');
      setTimeout(() => cel.classList.remove('editada'), 1300);
      timer = setTimeout(pular, 1500 + rnd() * 900);
    }, 950);
  }

  function pular() {
    if (!ativo) return;
    const opcoes = candidatas();
    if (!opcoes.length) return;
    atual = opcoes[Math.floor(rnd() * opcoes.length)];
    cursor.classList.add('visivel');
    posicionar(atual, !primeira);
    primeira = false;
    passo++;
    const vaiEditar = atual.dataset.versoes && passo % 2 === 0;
    timer = setTimeout(() => (vaiEditar ? editar(atual) : pular()), vaiEditar ? 750 : 1700 + rnd() * 1300);
  }

  registrarCena(folha, {
    entrar() {
      if (ativo) return;
      ativo = true;
      clearTimeout(timer);
      // Na primeira vez, espera a abertura (fórmula, #N/D, título) terminar.
      timer = setTimeout(pular, primeira ? 3000 : 700);
    },
    sair() {
      ativo = false;
      clearTimeout(timer);
    },
  });
  window.addEventListener('resize', () => atual && posicionar(atual, false));
}
