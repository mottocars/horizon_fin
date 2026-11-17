import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Plug } from 'lucide-react';
import { obterAplicativo } from '../../api/parceiros.api';
import { LogoParceiro } from '../../layout/LojaAplicativos';

// /aplicativos/:id — o aplicativo instalado (ícone do menu lateral) aberto dentro do Horizon, só com o
// menu lateral (tela cheia, ver AppShell). Até a primeira conexão: página em branco com o ícone e o
// botão Conectar. Conectar (e as próximas aberturas) carrega o sistema do parceiro num iframe pela URL
// de abertura + iss: o Login com Horizon (OIDC) identifica o usuário ali dentro — na primeira vez o
// parceiro pede o login dele e vincula a conta; depois, entra direto.
//
// sandbox: o parceiro roda normalmente (scripts, formulários, janelas, downloads), mas não consegue
// trocar a página do Horizon (sem allow-top-navigation).
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals';

export default function AplicativoPage() {
  const { id } = useParams();
  const [app, setApp] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    setApp(null);
    setErro('');
    setAberto(false);
    obterAplicativo(id)
      .then((a) => {
        setApp(a);
        setAberto(a.conectado);
      })
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível abrir o aplicativo.'));
  }, [id]);

  if (erro) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <p className="text-sm text-gray-600">{erro}</p>
        <Link to="/loja-aplicativos" className="text-sm font-medium text-primary-600 hover:text-primary-700">
          Ir para a Loja de aplicativos
        </Link>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 size={22} className="animate-spin text-gray-300" />
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white p-6 text-center">
        <LogoParceiro id={app.id} nome={app.nome} loja className="h-20 w-20" />
        <p className="mt-4 text-base font-semibold text-gray-900">{app.nome}</p>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
        >
          <Plug size={16} />
          Conectar
        </button>
      </div>
    );
  }

  return (
    <iframe
      key={app.id}
      title={app.nome}
      src={app.url_conectar}
      sandbox={SANDBOX}
      allow="clipboard-write"
      className="block h-screen w-full border-0 bg-white"
    />
  );
}
