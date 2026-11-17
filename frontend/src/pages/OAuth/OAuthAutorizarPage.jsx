import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { autorizarOidc } from '../../api/parceiros.api';

// Chave do sessionStorage com a página para voltar depois do login (lida em Login.jsx).
export const CHAVE_VOLTAR_LOGIN = 'horizon_voltar_apos_login';

// /oauth/authorize — authorization_endpoint do Login com Horizon (OIDC) dos parceiros (ver
// backend/src/modules/parceiros/oidc.js). O sistema do parceiro manda o navegador para cá; com o
// usuário logado, o backend gera o code e esta página devolve o usuário ao callback do parceiro na
// hora, sem pergunta nenhuma. Sem login: vai ao login do Horizon e volta para cá.
export default function OAuthAutorizarPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [erro, setErro] = useState('');
  const [aplicativo, setAplicativo] = useState('');
  const pedido = useRef(false);

  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    const voltar = `${window.location.pathname}${window.location.search}`;
    // Guardado antes da chamada: se a sessão tiver expirado, o http.js manda para o login sozinho.
    try {
      sessionStorage.setItem(CHAVE_VOLTAR_LOGIN, voltar);
    } catch {
      /* sem sessionStorage: depois do login cai na Home */
    }
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }
    autorizarOidc(Object.fromEntries(new URLSearchParams(window.location.search)))
      .then((r) => {
        try {
          sessionStorage.removeItem(CHAVE_VOLTAR_LOGIN);
        } catch {
          /* nada */
        }
        setAplicativo(r.aplicativo || '');
        window.location.replace(r.redirect);
      })
      .catch((e) => {
        try {
          sessionStorage.removeItem(CHAVE_VOLTAR_LOGIN);
        } catch {
          /* nada */
        }
        setErro(e.response?.data?.message || 'Não foi possível conectar ao aplicativo. Tente de novo pela Loja de aplicativos.');
      });
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg p-4">
      <div className="w-full max-w-sm rounded-card bg-white p-8 text-center shadow-card">
        <img src="/logomarca.svg" alt="Horizon" className="mx-auto mb-6 h-9 w-auto" />
        {erro ? (
          <>
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <AlertTriangle size={20} />
            </span>
            <p className="text-sm font-semibold text-gray-900">Não foi possível conectar</p>
            <p className="mt-1 text-sm text-gray-500">{erro}</p>
            <button
              type="button"
              onClick={() => navigate('/loja-aplicativos', { replace: true })}
              className="mt-5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
            >
              Ir para a Loja de aplicativos
            </button>
          </>
        ) : (
          <>
            <Loader2 size={22} className="mx-auto mb-3 animate-spin text-primary-600" />
            <p className="text-sm text-gray-600">{aplicativo ? `Conectando ao ${aplicativo}…` : 'Conectando…'}</p>
          </>
        )}
      </div>
    </div>
  );
}
