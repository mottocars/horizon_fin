import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

// Peças compartilhadas pelos gráficos e seções do painel do Fluxo de Caixa.

// Mesmas cores dos tokens de painel.css (atributos de SVG não leem var()).
export const COR = {
  ink: '#13202a',
  ink2: '#44525c',
  muted: '#6b7780',
  grid: '#e3e8eb',
  surface: '#fbfcfc',
  surface2: '#f2f5f6',
  accent: '#1d5c8a',
  entrada: '#2a78d6',
  cenario: '#eb6834',
  saida: '#e34948',
  neutro: '#9aa6ae',
  crit: '#d03b3b',
  critInk: '#b42d2d',
};

// Dica flutuante (.cfo-tip): mostrar(evento, título, [[rótulo, valor], ...]) / esconder().
export const DicaCtx = createContext({ mostrar: () => {}, esconder: () => {} });
export const useDica = () => useContext(DicaCtx);

// Largura do quadro (ResizeObserver) — os gráficos desenham na largura exata.
export function useLargura(minimo = 320) {
  const ref = useRef(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setLargura(el.clientWidth);
    const ro = new ResizeObserver(() => setLargura(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(minimo, largura)];
}
