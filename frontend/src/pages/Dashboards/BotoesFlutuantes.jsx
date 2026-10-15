import { Menu, SlidersHorizontal } from 'lucide-react';

// Botões flutuantes dos Dashboards (pedido do usuário): "Menu" e "Filtros", no canto inferior
// direito da janela — `fixed`, então ficam visíveis em toda a rolagem da página. O que cada um abre
// será definido depois (`onMenu` / `onFiltros`).
function Botao({ titulo, onClick, children, destaque = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={`flex h-12 w-12 items-center justify-center rounded-full shadow-[0_8px_24px_-6px_rgba(15,23,42,0.35)] ring-1 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgba(15,23,42,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        destaque ? 'bg-primary-600 text-white ring-primary-600 hover:bg-primary-700' : 'bg-white text-gray-700 ring-gray-200 hover:text-primary-700'
      }`}
    >
      {children}
    </button>
  );
}

export default function BotoesFlutuantes({ onMenu, onFiltros }) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3">
      <Botao titulo="Menu" onClick={onMenu}>
        <Menu size={20} />
      </Botao>
      <Botao titulo="Filtros" onClick={onFiltros} destaque>
        <SlidersHorizontal size={20} />
      </Botao>
    </div>
  );
}
