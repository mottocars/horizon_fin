import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Megaphone, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { baixarMidiaNovidade, marcarNovidadeVista, minhasNovidades } from '../api/novidades.api';

// Novidades do sistema (Cadastros › Novidades) para o usuário logado:
//   - ao entrar, as que ele ainda não viu abrem numa janela, uma atrás da outra
//     (Próxima → Concluir), na ordem em que foram lançadas;
//   - a novidade fica marcada como vista quando aparece na janela (fechar no
//     meio deixa as seguintes para o próximo acesso);
//   - o botão "Novidades" do topo (ao lado de Conexões com IA) mostra as 5
//     últimas e, em "Ver mais", todas — clicar abre a janela daquela novidade
//     como no primeiro acesso.
// A janela é a mesma da prévia do cadastro (JanelaNovidades, exportada).

// ─── GIF (vem do banco por rota autenticada → blob → object URL, com cache) ──
const cacheMidia = new Map(); // `${rota}|${id}|${versao}` → Promise<string>

function urlDaMidia(id, versao, cadastro) {
  const chave = `${cadastro ? 'c' : 'm'}|${id}|${versao}`;
  if (!cacheMidia.has(chave)) {
    const p = baixarMidiaNovidade(id, { cadastro }).then((blob) => URL.createObjectURL(blob));
    p.catch(() => cacheMidia.delete(chave));
    cacheMidia.set(chave, p);
  }
  return cacheMidia.get(chave);
}

// `novidade.midia_url` (prévia do cadastro com um arquivo escolhido agora) tem prioridade.
export function useMidiaNovidade(novidade, cadastro) {
  const [url, setUrl] = useState(novidade?.midia_url || null);
  useEffect(() => {
    if (!novidade) return undefined;
    if (novidade.midia_url) {
      setUrl(novidade.midia_url);
      return undefined;
    }
    if (!novidade.id || !novidade.tem_midia) {
      setUrl(null);
      return undefined;
    }
    let vivo = true;
    setUrl(null);
    urlDaMidia(novidade.id, novidade.atualizado_em, cadastro)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
    };
  }, [novidade, cadastro]);
  return url;
}

export function formatarDataNovidade(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── descrição: parágrafos separados por linha em branco; linhas que começam
// com "- " ou "• " viram a lista de benefícios (com ✓) ──
function blocosDescricao(texto) {
  const blocos = [];
  for (const linha of String(texto || '').split(/\r?\n/)) {
    const item = linha.match(/^\s*[-•]\s+(.*)$/);
    const ultimo = blocos[blocos.length - 1];
    if (item) {
      if (ultimo?.tipo === 'lista') ultimo.itens.push(item[1]);
      else blocos.push({ tipo: 'lista', itens: [item[1]] });
    } else if (!linha.trim()) {
      if (ultimo && !ultimo.fechado) ultimo.fechado = true;
    } else if (ultimo?.tipo === 'p' && !ultimo.fechado) {
      ultimo.texto += ` ${linha.trim()}`;
    } else {
      blocos.push({ tipo: 'p', texto: linha.trim() });
    }
  }
  return blocos;
}

export function DescricaoNovidade({ texto }) {
  return (
    <div className="space-y-3">
      {blocosDescricao(texto).map((b, i) =>
        b.tipo === 'lista' ? (
          <ul key={i} className="space-y-2">
            {b.itens.map((it, j) => (
              <li key={j} className="flex gap-2.5 text-[13.5px] leading-snug text-gray-800">
                <Check size={16} strokeWidth={2.6} className="mt-px shrink-0 text-primary-600" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-[14.5px] leading-relaxed text-gray-600">
            {b.texto}
          </p>
        )
      )}
    </div>
  );
}

// Texto corrido da descrição (sem os marcadores) — para os resumos da lista.
export function resumoDescricao(texto) {
  return blocosDescricao(texto)
    .map((b) => (b.tipo === 'lista' ? b.itens.join(' · ') : b.texto))
    .join(' ');
}

// ─── a janela ───────────────────────────────────────────────────────────────
// `novidades`: as que vão aparecer, na ordem; `onVer(id)` quando cada uma
// aparece; `cadastro`: busca o GIF pela rota da tela de cadastro (prévia).
export function JanelaNovidades({ novidades, inicio = 0, onFechar, onVer, cadastro = false }) {
  const [passo, setPasso] = useState(inicio);
  const atual = novidades[passo];
  const ultimo = passo === novidades.length - 1;
  const midia = useMidiaNovidade(atual, cadastro);
  const botaoRef = useRef(null);

  useEffect(() => {
    if (atual?.id) onVer?.(atual.id);
    botaoRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.id]);

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onFechar]);

  if (!atual) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-gray-900/60 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="novidade-titulo"
    >
      <div className="grid max-h-full w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.5fr)]">
        <div key={atual.id ?? passo} className="novidade-entra flex min-h-0 flex-col gap-4 overflow-y-auto p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary-700">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
              Novidade
            </span>
            <div className="flex items-center gap-3">
              {novidades.length > 1 && (
                <span className="text-xs tabular-nums text-gray-400">
                  {passo + 1} de {novidades.length}
                </span>
              )}
              <button
                type="button"
                onClick={onFechar}
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {atual.criado_em && <p className="-mb-1 text-xs text-gray-400">Lançada em {formatarDataNovidade(atual.criado_em)}</p>}
          <h2 id="novidade-titulo" className="text-balance text-2xl font-semibold leading-tight tracking-tight text-gray-900">
            {atual.nome}
          </h2>
          <DescricaoNovidade texto={atual.descricao} />

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div className="flex gap-1.5" aria-hidden="true">
              {novidades.length > 1 &&
                novidades.map((n, i) => (
                  <span
                    key={n.id ?? i}
                    className={`h-2 rounded-full transition-all ${i === passo ? 'w-6 bg-primary-600' : 'w-2 bg-gray-200'}`}
                  />
                ))}
            </div>
            <div className="flex gap-2">
              {passo > 0 && (
                <button
                  type="button"
                  onClick={() => setPasso((p) => p - 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <ArrowLeft size={15} />
                  Voltar
                </button>
              )}
              <button
                ref={botaoRef}
                type="button"
                onClick={() => (ultimo ? onFechar() : setPasso((p) => p + 1))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
              >
                {ultimo ? 'Concluir' : 'Próxima novidade'}
                {!ultimo && <ArrowRight size={15} />}
              </button>
            </div>
          </div>
        </div>

        <div
          className="order-first flex min-w-0 flex-col justify-center gap-3 p-4 sm:p-6 md:order-none"
          style={{ background: 'radial-gradient(120% 90% at 100% 0%, #182a5c 0%, #0f1b3d 60%)' }}
        >
          <div className="overflow-hidden rounded-xl bg-white shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-1.5 bg-gray-100 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
              <span className="ml-2 truncate text-[11px] text-gray-500">Horizon · {atual.nome}</span>
            </div>
            {midia ? (
              <img src={midia} alt={`Demonstração: ${atual.nome}`} className="block h-auto w-full" />
            ) : (
              <div className="aspect-[3/2] w-full animate-pulse bg-gray-100" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── estado: novidades do usuário + janela aberta ────────────────────────────
const Contexto = createContext({ novidades: [], abrir: () => {}, abrirLista: () => {} });
export const useNovidades = () => useContext(Contexto);

export function NovidadesProvider({ children }) {
  const { user } = useAuth();
  const [novidades, setNovidades] = useState([]);
  const [janela, setJanela] = useState(null); // { itens, inicio } | null
  const [listaAberta, setListaAberta] = useState(false);

  useEffect(() => {
    if (!user?.id) return undefined;
    let vivo = true;
    minhasNovidades()
      .then((lista) => {
        if (!vivo) return;
        setNovidades(lista);
        // Ao entrar: as não vistas, da mais antiga para a mais nova.
        const pendentes = lista.filter((n) => !n.vista).reverse();
        if (pendentes.length) setJanela({ itens: pendentes, inicio: 0 });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [user?.id]);

  const marcarVista = useCallback((id) => {
    setNovidades((lista) => {
      const n = lista.find((x) => x.id === id);
      if (!n || n.vista) return lista;
      marcarNovidadeVista(id).catch(() => {});
      return lista.map((x) => (x.id === id ? { ...x, vista: true } : x));
    });
  }, []);

  const abrir = useCallback((novidade) => {
    setListaAberta(false);
    setJanela({ itens: [novidade], inicio: 0 });
  }, []);

  const valor = useMemo(
    () => ({ novidades, abrir, abrirLista: () => setListaAberta(true) }),
    [novidades, abrir]
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      {listaAberta && <ListaNovidades novidades={novidades} onAbrir={abrir} onFechar={() => setListaAberta(false)} />}
      {janela && (
        <JanelaNovidades
          key={janela.itens.map((n) => n.id).join('-')}
          novidades={janela.itens}
          inicio={janela.inicio}
          onVer={marcarVista}
          onFechar={() => setJanela(null)}
        />
      )}
    </Contexto.Provider>
  );
}

// ─── botão do topo (ao lado de Conexões com IA) ──────────────────────────────
export function BotaoNovidades() {
  const { novidades, abrir, abrirLista } = useNovidades();
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef(null);
  const naoVistas = novidades.filter((n) => !n.vista).length;

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => caixaRef.current && !caixaRef.current.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const ultimas = novidades.slice(0, 5);

  return (
    <div className="group relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label="Novidades"
        aria-expanded={aberto}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${
          aberto ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700'
        }`}
      >
        <Megaphone size={17} />
        {naoVistas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
          </span>
        )}
      </button>
      {!aberto && (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-11 z-50 w-max rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          Novidades
        </span>
      )}

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Novidades</p>
            <span className="text-xs text-gray-400">Últimas {Math.min(5, novidades.length) || ''}</span>
          </div>
          {ultimas.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma novidade por enquanto.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
              {ultimas.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAberto(false);
                      abrir(n);
                    }}
                    className="flex w-full gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.vista ? 'bg-transparent' : 'bg-primary-500'}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug text-gray-900">{n.nome}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{resumoDescricao(n.descricao)}</span>
                      <span className="mt-1 block text-[11px] text-gray-400">{formatarDataNovidade(n.criado_em)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {novidades.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                abrirLista();
              }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 px-4 py-2.5 text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
            >
              Ver mais
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── "Ver mais": todas as novidades ──────────────────────────────────────────
function ListaNovidades({ novidades, onAbrir, onFechar }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="novidades-lista-titulo"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4">
          <div>
            <h2 id="novidades-lista-titulo" className="text-lg font-semibold text-gray-900">
              Novidades do Horizon
            </h2>
            <p className="text-xs text-gray-500">Clique numa novidade para ver a explicação completa.</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={17} />
          </button>
        </div>
        <ul className="divide-y divide-gray-100 overflow-y-auto">
          {novidades.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onAbrir(n)} className="flex w-full gap-4 px-6 py-4 text-left transition hover:bg-gray-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <Megaphone size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm font-semibold text-gray-900">{n.nome}</span>
                    <span className="text-xs text-gray-400">{formatarDataNovidade(n.criado_em)}</span>
                  </span>
                  <span className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-gray-500">{resumoDescricao(n.descricao)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
