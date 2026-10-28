import { useEffect, useRef } from 'react';
import { ABAS_SUMARIO, partesDoTexto } from './sumarioTexto';
import {
  Activity,
  BookOpen,
  Building2,
  CircleDollarSign,
  Filter,
  Gauge,
  Landmark,
  LayoutGrid,
  LineChart,
  Scale,
  Table2,
  TrendingDown,
  X,
} from 'lucide-react';

// Sumário do painel do Fluxo de Caixa (pedido do usuário): uma janela com uma aba por seção do painel,
// explicando o que cada análise mostra, de onde vêm os números, como ler e o que dá para clicar.
// Abre pelo botão "Sumário" da barra ou pelo "?" no título de cada seção (direto na aba dela).
// Os textos ficam em sumarioTexto.js (o MCP lê os mesmos).

// Ícone de cada aba (os textos ficam em sumarioTexto.js, fonte única com o MCP).
const ICONES = {
  filtros: Filter,
  indicadores: LayoutGrid,
  detalhamento: Table2,
  trajetoria: LineChart,
  entradas: Activity,
  folego: Building2,
  quemgera: Scale,
  carteira: Landmark,
  orcamento: Gauge,
  saidas: TrendingDown,
  divida: CircleDollarSign,
};

// Texto marcado (**negrito**, {tom|etiqueta}, {flag|selo}) -> elementos.
function Texto({ children }) {
  return partesDoTexto(children).map((p, i) =>
    p.b ? (
      <b key={i}>{p.b}</b>
    ) : p.etiqueta ? (
      <span key={i} className={`st ${p.etiqueta}`}>
        {p.t}
      </span>
    ) : p.selo ? (
      <span key={i} className={p.selo === 'flagw' ? 'flag w' : 'flag'}>
        {p.t}
      </span>
    ) : (
      p.t
    )
  );
}

// `abas` / `icones` / `contexto`: outro painel (o Aging List) usa a mesma janela com os textos dele.
export default function SumarioModal({ aberta, aba, onAba, onFechar, abas = ABAS_SUMARIO, icones = ICONES, contexto = 'Econômico Financeiro · Fluxo de Caixa' }) {
  const painel = useRef(null);
  const atual = abas.find((a) => a.id === aba) || abas[0];

  useEffect(() => {
    if (!aberta) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberta, onFechar]);

  // Conteúdo volta ao topo ao trocar de aba.
  useEffect(() => {
    if (painel.current) painel.current.scrollTop = 0;
  }, [aba]);

  if (!aberta) return null;

  // Setas para cima/baixo trocam de aba (padrão de lista de abas vertical).
  const mover = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const i = abas.findIndex((a) => a.id === atual.id);
    const prox = abas[(i + (e.key === 'ArrowDown' ? 1 : -1) + abas.length) % abas.length];
    onAba(prox.id);
    document.getElementById(`sum-aba-${prox.id}`)?.focus();
  };
  const Icone = icones[atual.id] || BookOpen;

  return (
    <div className="sumario-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="sumario" role="dialog" aria-modal="true" aria-labelledby="sumario-titulo">
        <header className="sumario-topo">
          <div>
            <div className="eyebrow">{contexto}</div>
            <h2 id="sumario-titulo">
              <BookOpen size={20} aria-hidden="true" /> Sumário das análises
            </h2>
          </div>
          <button type="button" className="sumario-fechar" onClick={onFechar} aria-label="Fechar o sumário" title="Fechar (Esc)">
            <X size={18} />
          </button>
        </header>
        <div className="sumario-corpo">
          <nav className="sumario-abas" role="tablist" aria-orientation="vertical" aria-label="Seções do painel" onKeyDown={mover}>
            {abas.map((a, i) => {
              const IconeAba = icones[a.id] || BookOpen;
              const ativa = a.id === atual.id;
              return (
                <button
                  key={a.id}
                  id={`sum-aba-${a.id}`}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  aria-controls="sumario-conteudo"
                  tabIndex={ativa ? 0 : -1}
                  className={ativa ? 'ativa' : ''}
                  onClick={() => onAba(a.id)}
                >
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <IconeAba size={15} aria-hidden="true" />
                  <span className="txt">{a.titulo}</span>
                </button>
              );
            })}
          </nav>
          <section id="sumario-conteudo" className="sumario-conteudo" role="tabpanel" aria-labelledby={`sum-aba-${atual.id}`} ref={painel}>
            <div className="sumario-cab">
              <span className="sumario-icone">
                <Icone size={20} aria-hidden="true" />
              </span>
              <div>
                <h3>{atual.titulo}</h3>
                <p>{atual.resumo}</p>
              </div>
            </div>
            {atual.blocos.map((b) => (
              <div key={b.titulo} className="sumario-bloco">
                <h4>{b.titulo}</h4>
                {b.texto && (
                  <p>
                    <Texto>{b.texto}</Texto>
                  </p>
                )}
                {b.itens && (
                  <ul>
                    {b.itens.map((it, k) => (
                      <li key={k}>
                        <Texto>{it}</Texto>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
