import { useEffect } from 'react';

// Premissa dos dashboards (pedido do usuário, 11/11/2026): todo número negativo aparece em vermelho.
// Em vez de cada tela decidir a cor, um observador marca (classe `neg-auto`, estilo em styles/index.css)
// o elemento cujo texto inteiro é um número negativo — "−R$ 1,2 mi", "-3,5%", "R$ -40 mil" — em
// qualquer tela, tabela, etiqueta ou gráfico. Zero não conta. Quem já tem um vermelho próprio para
// fundo escuro (classe `neg-propria`, ex.: totalizadoras da DRE em azul) fica com o dele.
const NEGATIVO = /^(?:[−–-]\s*(?:R\$\s*)?|R\$\s*[−–-]\s*)\d[\d.,]*(?:\s*(?:mil|mi|k|%|pp|dias?|d))?$/i;

const ehNegativo = (t) => {
  const s = t.trim();
  return s.length > 1 && s.length < 24 && NEGATIVO.test(s) && /[1-9]/.test(s);
};

function varrer(raiz) {
  const it = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    const el = n.parentElement;
    if (!el || el.childNodes.length !== 1) continue; // só quando o número é o texto inteiro do elemento
    const propria = el.classList.contains('neg-propria') || !!el.parentElement?.classList.contains('neg-propria');
    el.classList.toggle('neg-auto', !propria && ehNegativo(n.nodeValue));
  }
}

export function useNegativosVermelhos(ativo) {
  useEffect(() => {
    if (!ativo) return undefined;
    const raiz = document.querySelector('main');
    if (!raiz) return undefined;
    let quadro = 0;
    const agendar = () => {
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        varrer(raiz);
      });
    };
    const obs = new MutationObserver(agendar);
    obs.observe(raiz, { childList: true, characterData: true, subtree: true });
    agendar();
    return () => {
      obs.disconnect();
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [ativo]);
}
