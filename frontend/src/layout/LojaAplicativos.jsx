import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Store } from 'lucide-react';
import { baixarLogoParceiro, listarLojaAplicativos } from '../api/parceiros.api';

// Loja de aplicativos (botão do topo, à esquerda de Novidades): os aplicativos dos parceiros
// aprovados em Cadastros › Parceiros. Por enquanto, clicar abre a URL de abertura do aplicativo
// numa aba nova — o fluxo de autorização com o client_id/client_secret vem na próxima etapa.

// Logo do parceiro (vem do banco por rota autenticada → blob). Cache por id durante a sessão.
const cacheLogos = new Map();
function urlDaLogo(id, loja) {
  const chave = `${loja ? 'l' : 'c'}${id}`;
  if (!cacheLogos.has(chave)) {
    cacheLogos.set(
      chave,
      baixarLogoParceiro(id, { loja })
        .then((blob) => URL.createObjectURL(blob))
        .catch((e) => {
          cacheLogos.delete(chave);
          throw e;
        })
    );
  }
  return cacheLogos.get(chave);
}

export function useLogoParceiro(id, { loja = false } = {}) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!id) return undefined;
    let vivo = true;
    urlDaLogo(id, loja)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
    };
  }, [id, loja]);
  return url;
}

// `xadrez`: fundo quadriculado (mostra se a logo é mesmo transparente — usado no cadastro).
export function LogoParceiro({ id, nome, loja = false, xadrez = false, className = 'h-10 w-10' }) {
  const url = useLogoParceiro(id, { loja });
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 ${
        xadrez ? 'bg-[length:12px_12px] bg-[conic-gradient(#f1f5f9_25%,#fff_0_50%,#f1f5f9_0_75%,#fff_0)]' : 'bg-white'
      } ${className}`}
    >
      {url ? (
        <img src={url} alt={nome || ''} className="h-full w-full object-contain p-1" />
      ) : (
        <span className="text-xs font-semibold text-gray-400">{(nome || '?').slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

export function BotaoLojaAplicativos() {
  const [aberto, setAberto] = useState(false);
  const [apps, setApps] = useState(null);
  const caixaRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    // Busca a cada abertura: um parceiro aprovado/suspenso aparece/some sem recarregar a página.
    listarLojaAplicativos()
      .then(setApps)
      .catch(() => setApps([]));
    const fora = (e) => caixaRef.current && !caixaRef.current.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div className="group relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label="Loja de aplicativos"
        aria-expanded={aberto}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${
          aberto ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700'
        }`}
      >
        <Store size={17} />
      </button>
      {!aberto && (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-11 z-50 w-max rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          Loja de aplicativos
        </span>
      )}

      {aberto && (
        <div className="absolute right-0 top-11 z-50 w-[400px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Loja de aplicativos</p>
            <p className="text-xs text-gray-400">Aplicativos dos parceiros do Horizon</p>
          </div>
          {apps === null ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Carregando...</p>
          ) : apps.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhum aplicativo disponível por enquanto.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
              {apps.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.url_abertura}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setAberto(false)}
                    className="group/app flex gap-3 px-4 py-3 transition hover:bg-gray-50"
                  >
                    <LogoParceiro id={a.id} nome={a.nome} loja className="h-11 w-11" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        {a.nome}
                        <ExternalLink size={12} className="text-gray-300 group-hover/app:text-primary-600" />
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{a.descricao}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
