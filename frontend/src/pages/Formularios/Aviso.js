import { useCallback } from 'react';

// Aviso rápido no rodapé da tela ("Link copiado.", "Formulário publicado.") — some sozinho em 2,5 s.
// Feito direto no DOM para não precisar de provider em volta das telas.
let atual = null;

export function mostrarAviso(texto) {
  if (atual) atual.remove();
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.className = 'form-aviso';
  el.textContent = texto;
  document.body.appendChild(el);
  atual = el;
  setTimeout(() => {
    el.classList.add('saindo');
    setTimeout(() => el.remove(), 250);
  }, 2500);
}

export function useAviso() {
  return useCallback((texto) => mostrarAviso(texto), []);
}
