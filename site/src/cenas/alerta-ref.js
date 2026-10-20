// Erro crítico "#REF!": quando uma edição da Juliana quebra a planilha da abertura, a janela inteira pisca, treme
// e fica vermelha com "ERRO #REF!" — só apresentação, sem botões. Dura ~4s e volta sozinha (um clique encerra
// antes). No máximo 3 vezes por visita, com intervalo mínimo, para não esconder o título o tempo todo.
// É ambiente (como a própria animação da Juliana): fica fora da árvore de acessibilidade.
const DURACAO = 3800;
const INTERVALO_MINIMO = 30000;
const MAXIMO = 3;

export function criarAlertaRef(folha) {
  let el = null;
  let celula = null;
  let timer = 0;
  let ultimo = -Infinity;
  let vezes = 0;

  function montar() {
    el = document.createElement('div');
    el.className = 'erro-critico';
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    el.innerHTML = `
      <svg class="erro-critico__icone" viewBox="0 0 48 48"><path d="M24 5 45 42H3Z" /><path d="M24 18v12" /><circle cx="24" cy="36" r="2.2" /></svg>
      <p class="erro-critico__titulo"><span>ERRO</span> #REF!</p>
      <p class="erro-critico__onde" data-onde></p>
      <p class="erro-critico__efeito">TOTAL, saldo de hoje e saldo em março: indisponíveis.</p>`;
    folha.appendChild(el);
    el.addEventListener('click', () => fechar());
  }

  function fechar() {
    clearTimeout(timer);
    timer = 0;
    celula?.classList.remove('quebrada');
    if (!el || el.hidden) return;
    el.classList.remove('ativo');
    el.classList.add('saindo');
    timer = setTimeout(() => {
      el.hidden = true;
      el.classList.remove('saindo');
    }, 350);
  }

  // cel: a célula que quebrou (data-ref="C4", data-rotulo="A receber da Aurora Alimentos").
  function alertar(cel) {
    const agora = performance.now();
    if (vezes >= MAXIMO || agora - ultimo < INTERVALO_MINIMO || (el && !el.hidden)) return;
    ultimo = agora;
    vezes++;
    if (!el) montar();
    celula = cel;
    el.querySelector('[data-onde]').textContent =
      cel.dataset.ref === 'C2'
        ? 'A Juliana atualizou o consolidado e a fórmula perdeu a referência.'
        : `A Juliana alterou a célula ${cel.dataset.ref} (${cel.dataset.rotulo}) e o consolidado perdeu a referência.`;
    cel.classList.add('quebrada');
    el.hidden = false;
    el.classList.remove('saindo');
    void el.offsetWidth; // reinicia as animações de entrada
    el.classList.add('ativo');
    folha.classList.remove('tremendo');
    void folha.offsetWidth;
    folha.classList.add('tremendo');
    clearTimeout(timer);
    timer = setTimeout(fechar, DURACAO);
  }

  // fechar(): também quando a planilha sai da tela.
  return { alertar, fechar };
}
