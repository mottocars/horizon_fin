import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, Menu, SlidersHorizontal, X } from 'lucide-react';

// Controles dos Dashboards (pedido do usuário): UM botão flutuante no canto inferior direito que abre
// um painel vertical do alto da área até logo acima dele (crescendo a partir do botão): metade de
// cima Telas (os botões das telas do dashboard), metade de baixo Filtros (os filtros da tela). O botão fica parado; flutua só com
// o mouse em cima.
// Fica na camada fixa da área de conteúdo (#camada-dashboard, AppShell.jsx): não rola com a página e
// não passa por cima do menu lateral.
// - `telas`: [{ id, label, icon? }]; `telaAtiva` / `onTela(id)`.
// - `filtros`: conteúdo da seção Filtros (os campos de cada dashboard).
// Fecha no botão (que vira X) ou com Esc.

const DURACAO_FECHAR = 240; // = animate-barra-desce (styles/index.css)

// Item do painel entrando em sequência (atraso por posição).
const entrada = (i) => ({ animationDelay: `${120 + i * 45}ms` });

// Metade do painel (Telas em cima, Filtros embaixo), com rolagem própria.
function Secao({ icone: Icone, titulo, ordem, children }) {
  return (
    <section className="motion-safe:animate-item-sobe flex min-h-0 flex-1 flex-col" style={entrada(ordem)}>
      <h3 className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <Icone size={13} className="text-primary-600" />
        {titulo}
      </h3>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </section>
  );
}

// Do alto da área até logo acima do botão: metade de cima Telas, metade de baixo Filtros.
function Painel({ fechando, telas, telaAtiva, onTela, filtros }) {
  return (
    <div
      role="dialog"
      aria-label="Menu do dashboard"
      className={`pointer-events-auto absolute bottom-21 right-6 top-6 flex w-80 origin-bottom-right flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-[0_24px_48px_-16px_rgba(15,23,42,0.35)] backdrop-blur ${
        fechando ? 'motion-safe:animate-barra-desce' : 'motion-safe:animate-barra-sobe'
      }`}
    >
      <Secao icone={LayoutGrid} titulo="Telas" ordem={0}>
        <div className="flex flex-col gap-2">
          {telas.map((t, i) => {
            const IconeTela = t.icon;
            const ativa = t.id === telaAtiva;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTela?.(t.id)}
                style={entrada(i + 1)}
                className={`motion-safe:animate-item-sobe flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                  ativa ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-700 hover:border-primary-100 hover:bg-gray-50'
                }`}
              >
                {IconeTela && <IconeTela size={16} />}
                {t.label}
              </button>
            );
          })}
        </div>
      </Secao>
      <div className="mx-4 shrink-0 border-t border-gray-100" />
      <Secao icone={SlidersHorizontal} titulo="Filtros" ordem={1}>
        {filtros && <div className="flex flex-col gap-3">{filtros}</div>}
      </Secao>
    </div>
  );
}

export default function ControlesDashboard({ telas = [], telaAtiva, onTela, filtros }) {
  const [camada, setCamada] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [fechando, setFechando] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setCamada(document.getElementById('camada-dashboard'));
    return () => clearTimeout(timer.current);
  }, []);

  const fechar = useCallback(() => {
    setFechando(true);
    clearTimeout(timer.current);
    // Sem animação (movimento reduzido) fecha na hora.
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(
      () => {
        setFechando(false);
        setAberto(false);
      },
      reduzido ? 0 : DURACAO_FECHAR
    );
  }, []);

  function alternar() {
    if (fechando) {
      clearTimeout(timer.current);
      setFechando(false);
      return;
    }
    if (aberto) fechar();
    else setAberto(true);
  }

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, fechar]);

  if (!camada) return null;
  const ativo = aberto && !fechando;
  return createPortal(
    <>
      {aberto && <Painel fechando={fechando} telas={telas} telaAtiva={telaAtiva} onTela={onTela} filtros={filtros} />}
      <button
        type="button"
        onClick={alternar}
        title={ativo ? 'Fechar menu' : 'Menu'}
        aria-label={ativo ? 'Fechar menu' : 'Menu'}
        aria-expanded={ativo}
        className={`pointer-events-auto absolute bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full border shadow-[0_8px_22px_-8px_rgba(15,23,42,0.35)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 motion-safe:hover:animate-flutuar ${
          ativo ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-100 hover:text-primary-700'
        }`}
      >
        {/* Menu vira X girando ao abrir. */}
        <span className={`transition-transform duration-300 ${ativo ? 'rotate-90' : ''}`}>{ativo ? <X size={20} /> : <Menu size={20} />}</span>
      </button>
    </>,
    camada
  );
}
