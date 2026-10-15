import { Filter, Menu } from 'lucide-react';

// Botões flutuantes dos Dashboards (pedido do usuário): "Menu" e "Filtros", no canto inferior
// direito da janela — `fixed`, então ficam visíveis em toda a rolagem da página. Flutuam (sobem e
// descem devagar, animação `flutuar` em styles/index.css), defasados entre si; quem prefere menos
// movimento no sistema operacional vê os botões parados. O que cada um abre será definido depois
// (`onMenu` / `onFiltros`). Borda e foco sem box-shadow: a animação mexe na sombra.
function Botao({ titulo, onClick, atraso, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      style={{ animationDelay: atraso }}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-[0_8px_22px_-8px_rgba(15,23,42,0.35)] transition-colors hover:border-primary-100 hover:text-primary-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 motion-safe:animate-flutuar"
    >
      {children}
    </button>
  );
}

export default function BotoesFlutuantes({ onMenu, onFiltros }) {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3">
      <Botao titulo="Menu" onClick={onMenu} atraso="0s">
        <Menu size={20} />
      </Botao>
      <Botao titulo="Filtros" onClick={onFiltros} atraso="-1.8s">
        <Filter size={19} />
      </Botao>
    </div>
  );
}
