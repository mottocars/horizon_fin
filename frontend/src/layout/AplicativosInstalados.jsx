import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { desinstalarAplicativo, instalarAplicativo, listarInstalados } from '../api/parceiros.api';

// Aplicativos dos parceiros instalados pelo usuário (Loja de aplicativos → Instalar): os ícones do fim
// do menu lateral, na ordem de instalação. Instalar faz o ícone se soltar da janela da loja e voar até
// o lugar dele no menu (o ícone do menu fica invisível até o voo pousar).

const Contexto = createContext(null);

const movimentoReduzido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const proximoQuadro = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// Voo do ícone: cópia do elemento de origem, fixa sobre a tela, que sobe um pouco (se solta), faz um
// arco flutuando e encolhe até o tamanho do ícone do menu. `aoSoltar` roda quando ele se solta (a
// janela da loja fecha nessa hora).
async function voar(origem, destino, aoSoltar) {
  const de = origem.getBoundingClientRect();
  const para = destino.getBoundingClientRect();
  const copia = origem.cloneNode(true);
  Object.assign(copia.style, {
    position: 'fixed',
    left: `${de.left}px`,
    top: `${de.top}px`,
    width: `${de.width}px`,
    height: `${de.height}px`,
    margin: '0',
    zIndex: '9999',
    pointerEvents: 'none',
    transformOrigin: 'top left',
    boxShadow: '0 18px 40px -12px rgba(15, 23, 42, 0.45)',
  });
  document.body.appendChild(copia);
  origem.style.visibility = 'hidden';
  aoSoltar?.();

  const dx = para.left - de.left;
  const dy = para.top - de.top;
  const escala = para.width / de.width;
  const voo = copia.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', offset: 0 },
      { transform: 'translate(0, -14px) scale(1.08) rotate(-3deg)', offset: 0.18 },
      { transform: `translate(${dx * 0.45}px, ${Math.min(dy, 0) * 0.5 - 70}px) scale(${(1 + escala) / 2}) rotate(-10deg)`, offset: 0.58 },
      { transform: `translate(${dx}px, ${dy}px) scale(${escala}) rotate(0deg)`, offset: 1 },
    ],
    { duration: 1150, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
  );
  await voo.finished.catch(() => {});
  copia.remove();
}

export function AplicativosInstaladosProvider({ children }) {
  const [instalados, setInstalados] = useState([]);
  const [chegando, setChegando] = useState(null);

  const recarregar = useCallback(() => {
    listarInstalados()
      .then(setInstalados)
      .catch(() => {});
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // origem: o elemento do ícone na janela da loja (de onde ele se solta).
  const instalar = useCallback(async (app, { origem, aoSoltar } = {}) => {
    const lista = await instalarAplicativo(app.id);
    const animar = origem && !movimentoReduzido();
    if (animar) setChegando(app.id);
    setInstalados(lista);
    if (!animar) {
      aoSoltar?.();
      return;
    }
    await proximoQuadro();
    const destino = document.querySelector(`[data-aplicativo-instalado="${app.id}"]`);
    if (destino && destino.getClientRects().length) {
      await voar(origem, destino, aoSoltar);
      setChegando(null);
      // Pousou: um "pulo" pequeno no lugar.
      destino.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(0.92)' }, { transform: 'scale(1)' }], {
        duration: 380,
        easing: 'ease-out',
      });
    } else {
      setChegando(null);
      aoSoltar?.();
    }
  }, []);

  const desinstalar = useCallback(async (id) => {
    setInstalados(await desinstalarAplicativo(id));
  }, []);

  const valor = useMemo(
    () => ({ instalados, chegando, instalar, desinstalar, recarregar }),
    [instalados, chegando, instalar, desinstalar, recarregar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAplicativosInstalados() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAplicativosInstalados deve ser usado dentro de AplicativosInstaladosProvider');
  return ctx;
}
