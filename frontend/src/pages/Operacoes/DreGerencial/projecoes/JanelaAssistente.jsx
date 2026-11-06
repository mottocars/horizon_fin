import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Janela do assistente de orçamento: cresce e encolhe (largura e altura animadas) conforme o conteúdo
// de cada etapa, sem nunca encostar nas bordas da tela (margem de 48px dos lados e 32px em cima/
// embaixo). `largura`: a largura que a etapa pede (px) — limitada à da tela. A altura acompanha o
// conteúdo (ResizeObserver); só passando da tela o corpo rola. `chave` troca a cada etapa e faz o
// conteúdo entrar subindo (animate-item-sobe, a mesma dos painéis dos Dashboards).
const MARGEM_X = 96;
const MARGEM_Y = 64;

function useTela() {
  const [tela, setTela] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const aoMudar = () => setTela({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', aoMudar);
    return () => window.removeEventListener('resize', aoMudar);
  }, []);
  return tela;
}

export default function JanelaAssistente({ largura, cabecalho, rodape, chave, children }) {
  const tela = useTela();
  const cabRef = useRef(null);
  const rodRef = useRef(null);
  const corpoRef = useRef(null);
  const [alturas, setAlturas] = useState({ cab: 0, corpo: 0, rod: 0 });
  const [pronto, setPronto] = useState(false);

  useLayoutEffect(() => {
    const medir = () =>
      setAlturas({
        cab: cabRef.current?.offsetHeight || 0,
        corpo: corpoRef.current?.offsetHeight || 0,
        rod: rodRef.current?.offsetHeight || 0,
      });
    medir();
    const ro = new ResizeObserver(medir);
    [cabRef, corpoRef, rodRef].forEach((r) => r.current && ro.observe(r.current));
    // A primeira medida sai sem animação (a janela já abre no tamanho certo).
    const t = requestAnimationFrame(() => setPronto(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(t);
    };
  }, []);

  const w = Math.min(largura, tela.w - MARGEM_X);
  const h = Math.min(alturas.cab + alturas.corpo + alturas.rod, tela.h - MARGEM_Y);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        style={{ width: w, height: h || undefined }}
        className={`flex max-w-full flex-col overflow-hidden rounded-card bg-white shadow-card ${
          pronto ? 'transition-[width,height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]' : ''
        }`}
      >
        <div ref={cabRef} className="shrink-0">
          {cabecalho}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={corpoRef}>
            <div key={chave} className="animate-item-sobe">
              {children}
            </div>
          </div>
        </div>
        <div ref={rodRef} className="shrink-0">
          {rodape}
        </div>
      </div>
    </div>
  );
}
