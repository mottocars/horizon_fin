import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Store } from 'lucide-react';
import { baixarLogoParceiro } from '../api/parceiros.api';

// Loja de aplicativos (botão do topo, à esquerda de Novidades): os aplicativos dos parceiros
// aprovados em Cadastros › Parceiros. A tela fica em pages/LojaAplicativos.
export const ROTA_LOJA = '/loja-aplicativos';

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
// `puro`: só a imagem PNG, sem moldura nem fundo (ícone do menu lateral).
export function LogoParceiro({ id, nome, loja = false, xadrez = false, puro = false, className = 'h-10 w-10' }) {
  const url = useLogoParceiro(id, { loja });
  if (puro) {
    return url ? (
      <img src={url} alt={nome || ''} className={`block shrink-0 object-contain ${className}`} />
    ) : (
      <span className={`flex shrink-0 items-center justify-center text-[10px] font-semibold text-gray-400 ${className}`}>
        {(nome || '?').slice(0, 2).toUpperCase()}
      </span>
    );
  }
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

// Botão do topo: abre a tela da Loja de aplicativos (/loja-aplicativos), com um card por aplicativo.
export function BotaoLojaAplicativos() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ativo = pathname === ROTA_LOJA;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => navigate(ROTA_LOJA)}
        aria-label="Loja de aplicativos"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition ${
          ativo ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700'
        }`}
      >
        <Store size={17} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-11 z-50 w-max rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        Loja de aplicativos
      </span>
    </div>
  );
}
