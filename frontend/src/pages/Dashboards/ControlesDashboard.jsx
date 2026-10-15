import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, LayoutGrid, Menu, SlidersHorizontal, X } from 'lucide-react';

// Controles dos Dashboards (pedido do usuário): dois botões flutuantes no canto inferior direito —
// Menu e Filtros — que abrem, cada um, uma barra que SOBE do rodapé com as opções de tela do
// dashboard e os filtros da tela. Parados; só o botão sob o mouse flutua.
// Ficam na camada fixa da área de conteúdo (#camada-dashboard, AppShell.jsx): não rolam com a página
// e não passam por cima do menu lateral.
// - `telas`: [{ id, label, icon? }] — opções do Menu; `telaAtiva` / `onTela(id)`.
// - `filtros`: conteúdo da barra de Filtros (os campos de cada dashboard).
// Uma barra aberta por vez; fecha no mesmo botão, no X ou com Esc (a outra barra espera esta descer).

const DURACAO_FECHAR = 240; // = animate-barra-desce (styles/index.css)

function BotaoFlutuante({ titulo, ativo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      aria-expanded={ativo}
      className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border shadow-[0_8px_22px_-8px_rgba(15,23,42,0.35)] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 motion-safe:hover:animate-flutuar ${
        ativo ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-primary-100 hover:text-primary-700'
      }`}
    >
      {children}
    </button>
  );
}

// Opção da barra entrando em sequência (atraso por posição).
const entrada = (i) => ({ animationDelay: `${120 + i * 45}ms` });

function Vazio({ texto }) {
  return (
    <p className="motion-safe:animate-item-sobe text-sm text-gray-400" style={entrada(0)}>
      {texto}
    </p>
  );
}

function Barra({ tipo, fechando, onFechar, telas, telaAtiva, onTela, filtros }) {
  const menu = tipo === 'menu';
  const Icone = menu ? LayoutGrid : SlidersHorizontal;
  return (
    <section
      role="dialog"
      aria-label={menu ? 'Telas do dashboard' : 'Filtros'}
      className={`pointer-events-auto absolute bottom-6 left-6 right-[96px] rounded-2xl border border-gray-200 bg-white/95 shadow-[0_24px_48px_-16px_rgba(15,23,42,0.35)] backdrop-blur ${
        fechando ? 'motion-safe:animate-barra-desce' : 'motion-safe:animate-barra-sobe'
      }`}
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Icone size={16} />
        </span>
        <h2 className="text-sm font-semibold text-gray-900">{menu ? 'Telas do dashboard' : 'Filtros'}</h2>
        <button
          type="button"
          onClick={onFechar}
          title="Fechar"
          aria-label="Fechar"
          className="ml-auto rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex min-h-[72px] items-center gap-2 overflow-x-auto px-5 py-4">
        {menu ? (
          telas.length ? (
            telas.map((t, i) => {
              const IconeTela = t.icon;
              const ativa = t.id === telaAtiva;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTela?.(t.id)}
                  style={entrada(i)}
                  className={`motion-safe:animate-item-sobe flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                    ativa ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-700 hover:border-primary-100 hover:bg-gray-50'
                  }`}
                >
                  {IconeTela && <IconeTela size={16} />}
                  {t.label}
                </button>
              );
            })
          ) : (
            <Vazio texto="As telas deste dashboard aparecerão aqui." />
          )
        ) : filtros ? (
          <div className="motion-safe:animate-item-sobe flex flex-wrap items-end gap-3" style={entrada(0)}>
            {filtros}
          </div>
        ) : (
          <Vazio texto="Os filtros desta tela aparecerão aqui." />
        )}
      </div>
    </section>
  );
}

export default function ControlesDashboard({ telas = [], telaAtiva, onTela, filtros }) {
  const [camada, setCamada] = useState(null);
  const [aberta, setAberta] = useState(null); // 'menu' | 'filtros' | null
  const [fechando, setFechando] = useState(false);
  const proxima = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    setCamada(document.getElementById('camada-dashboard'));
    return () => clearTimeout(timer.current);
  }, []);

  const fechar = useCallback((depois = null) => {
    proxima.current = depois;
    setFechando(true);
    clearTimeout(timer.current);
    // Sem animação (movimento reduzido) fecha na hora.
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(
      () => {
        setFechando(false);
        setAberta(proxima.current);
        proxima.current = null;
      },
      reduzido ? 0 : DURACAO_FECHAR
    );
  }, []);

  function alternar(tipo) {
    if (fechando) {
      proxima.current = proxima.current === tipo ? null : tipo;
      return;
    }
    if (aberta === tipo) fechar();
    else if (aberta) fechar(tipo);
    else setAberta(tipo);
  }

  useEffect(() => {
    if (!aberta) return undefined;
    const aoTeclar = (e) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberta, fechar]);

  if (!camada) return null;
  return createPortal(
    <>
      {aberta && (
        <Barra
          key={aberta}
          tipo={aberta}
          fechando={fechando}
          onFechar={() => fechar()}
          telas={telas}
          telaAtiva={telaAtiva}
          onTela={onTela}
          filtros={filtros}
        />
      )}
      <div className="absolute bottom-6 right-6 flex flex-col items-center gap-3">
        <BotaoFlutuante titulo="Menu" ativo={aberta === 'menu' && !fechando} onClick={() => alternar('menu')}>
          <Menu size={20} />
        </BotaoFlutuante>
        <BotaoFlutuante titulo="Filtros" ativo={aberta === 'filtros' && !fechando} onClick={() => alternar('filtros')}>
          <Filter size={19} />
        </BotaoFlutuante>
      </div>
    </>,
    camada
  );
}
