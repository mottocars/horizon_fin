// Monitor de Integrações (seção 9): a linha do conector da IA alterna entre "consultando" e "respondido"
// enquanto a tela está à vista — o resto é HTML estático.
import { registrarCena } from '../nucleo/cenas.js';
import { reduzir } from '../nucleo/preferencias.js';

export function montarIntegracoes(raiz) {
  const st = raiz?.querySelector('[data-rodando] .st');
  if (!st) return;
  let timer = 0;
  let consultando = true;
  const alternar = () => {
    consultando = !consultando;
    st.className = `st ${consultando ? 'info' : 'good'}`;
    st.textContent = consultando ? 'consultando' : 'respondido';
    timer = setTimeout(alternar, consultando ? 1800 : 2600);
  };
  registrarCena(raiz, {
    entrar() {
      if (!reduzir()) timer = setTimeout(alternar, 1800);
    },
    sair() {
      clearTimeout(timer);
    },
  });
}
