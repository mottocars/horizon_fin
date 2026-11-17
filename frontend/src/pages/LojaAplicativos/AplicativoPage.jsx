import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Plug } from 'lucide-react';
import { obterAplicativo } from '../../api/parceiros.api';
import { LogoParceiro } from '../../layout/LojaAplicativos';
import { useAplicativosInstalados } from '../../layout/AplicativosInstalados';

// /aplicativos/:id — o aplicativo instalado (ícone do menu lateral) aberto dentro do Horizon, só com o
// menu lateral (tela cheia, ver AppShell). Até a primeira conexão: página em branco com o ícone e o
// botão Conectar. Conectar (e as próximas aberturas) carrega o sistema do parceiro pela URL de abertura
// + iss: o Login com Horizon (OIDC) identifica o usuário ali dentro — na primeira vez o parceiro pede o
// login dele e vincula a conta; depois, entra direto.
//
// O iframe não fica aqui: fica na CamadaAplicativos (layout/AplicativosInstalados.jsx), que o mantém
// vivo em segundo plano quando o usuário vai para outra tela. Esta página só decide entre o botão
// Conectar e abrir o aplicativo na camada.
export default function AplicativoPage() {
  const { id } = useParams();
  const { abertos, abrir } = useAplicativosInstalados();
  const jaAberto = abertos.some((a) => a.id === Number(id));
  const [app, setApp] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (jaAberto) return;
    setApp(null);
    setErro('');
    obterAplicativo(id)
      .then((a) => {
        setApp(a);
        if (a.conectado) abrir(a);
      })
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível abrir o aplicativo.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Aberto: a camada cobre esta área com o aplicativo.
  if (jaAberto) return <div className="h-screen bg-white" />;

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

  if (!app || app.conectado) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 size={22} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-white p-6 text-center">
      <LogoParceiro id={app.id} nome={app.nome} loja className="h-20 w-20" />
      <p className="mt-4 text-base font-semibold text-gray-900">{app.nome}</p>
      <button
        type="button"
        onClick={() => abrir(app)}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
      >
        <Plug size={16} />
        Conectar
      </button>
    </div>
  );
}
